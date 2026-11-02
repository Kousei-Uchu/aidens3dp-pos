import ExpoModulesCore
import CloudKit
import Foundation

// The iCloud container declared by plugins/withCloudKit.js. The two must stay the same string: the entitlement and
// this identifier together are what let CloudKit open the container, and a mismatch fails at runtime, not at build.
private let cloudKitContainerIdentifier = "iCloud.com.aidens3dp.pos"

// The one zone every till shares: the owner's private database holds it, participants see it in their shared database.
// The name is the same on both sides, so the two roles can find each other.
private let cloudKitZoneName = "Store"

// Where a share link that opened the app is kept, so a cold launch can be finished from the Cloud sync page rather than
// needing the link pasted again. Written by the AppDelegate method that plugins/withCloudKit.js injects.
private let cloudKitPendingInviteKey = "cloudkitPendingInvite"

/// The fields kept as CloudKit encrypted values, by record type (decisions item 17). They are never written as plain fields:
/// copyFields skips them, and they only travel through the separate `encrypted` argument. CKRecord.allKeys() does not list
/// encrypted values, so recordToDict reads these keys by name.
private let cloudKitEncryptedKeys: [String: [String]] = ["Sale": ["secure_json"], "Audit": ["secure_json"]]
private let cloudKitNeverPlainKeys: Set<String> = Set(cloudKitEncryptedKeys.values.flatMap { $0 })

// The AppDelegate posts this when iOS hands the app a share link. The module joins on the spot; the AppDelegate cannot,
// because it does not own the container logic.
private let cloudKitDidAcceptShareNotification = Notification.Name("cloudkitDidAcceptShare")

// What the Cloud sync page reads back. `role` is "owner" on the till that set the shop up, "participant" on a till that
// joined, and "none" on a till that has done neither.
struct CloudKitStateRecord: Record {
  @Field var account: String = "couldNotDetermine"
  @Field var role: String = "none"
  @Field var shareURL: String? = nil
}

// Patch 2 of dev_docs/CLOUDKIT_SYNC_PLAN.md: the zone, the share and the answers the account screen needs. The records
// themselves (the sync engine) arrive in patch 3; this patch only opens the door and says which side of it a till is on.
public class CloudKitSyncModule: Module {
  private var shareObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("CloudKitSync")

    Events("onShareJoined")

    // Join a share the moment iOS hands one over. Registering on create (not on a JS listener) means the invite is
    // accepted even if nobody is looking at the Cloud sync page when the link is tapped.
    OnCreate {
      self.shareObserver = NotificationCenter.default.addObserver(
        forName: cloudKitDidAcceptShareNotification,
        object: nil,
        queue: .main
      ) { [weak self] note in
        guard let self, let metadata = note.object as? CKShare.Metadata else { return }
        Task { await self.join(metadata) }
      }
    }

    OnDestroy {
      if let observer = self.shareObserver { NotificationCenter.default.removeObserver(observer) }
      self.shareObserver = nil
    }

    // Whether CloudKit can run here. The deployment target is iOS 17, so a real build always answers true; the
    // check keeps a stray old build honest rather than pretending.
    Function("isSupported") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    // The device's iCloud account state. A till with no account, or one restricted by policy, must never crash:
    // an error becomes "couldNotDetermine" and the caller shows a plain line.
    AsyncFunction("getAccountStatus") { () async -> String in
      await self.accountStatus()
    }

    // Which side of the share this till is on, plus the invite link when it owns the shop.
    AsyncFunction("getState") { () async -> CloudKitStateRecord in
      await self.state()
    }

    // Set this till up as the shop's owner: create the zone if it is missing, then a link anyone can use to join.
    AsyncFunction("createZoneAndShare") { () async throws -> String in
      try await self.createZoneAndShare()
    }

    // Join from a link the owner sent. A missing or expired link is an error the caller shows in plain words.
    AsyncFunction("acceptShare") { (url: String) async throws -> Bool in
      try await self.acceptShareURL(url)
      return true
    }

    // A share link that opened the app while no one was on this page. Taking it clears it, so it is offered once.
    AsyncFunction("takePendingInvite") { () -> String? in
      let url = UserDefaults.standard.string(forKey: cloudKitPendingInviteKey)
      UserDefaults.standard.removeObject(forKey: cloudKitPendingInviteKey)
      return url
    }

    // --- Patch 4: sales and rollups ---
    AsyncFunction("putSale") { (handle: String, fields: [String: Any], encrypted: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Sale", recordName: "sale-\(handle)", fields: fields, encrypted: encrypted)
    }

    AsyncFunction("getSale") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Sale", recordName: "sale-\(handle)")
    }

    AsyncFunction("listSales") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Sale", limit: limit, after: after)
    }

    AsyncFunction("putRollup") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Rollup", recordName: "rollup-\(handle)", fields: fields)
    }

    AsyncFunction("getRollup") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Rollup", recordName: "rollup-\(handle)")
    }

    AsyncFunction("listRollups") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Rollup", limit: limit, after: after)
    }

    // --- Patch 4: events and payment attempts ---
    // An event is written once and never changed. An attempt is updated in place (its status only moves forward, which the
    // JavaScript side checks before it writes). A resolution is written once: if one is already there it is handed back
    // untouched, so the first register to resolve a payment is the one that stays.
    AsyncFunction("putEvent") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecordOnce(recordType: "Event", recordName: "event-\(handle)", fields: fields)
    }

    AsyncFunction("listEvents") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Event", limit: limit, after: after)
    }

    AsyncFunction("putAttempt") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.upsertRecord(recordType: "Attempt", recordName: "attempt-\(handle)", fields: fields)
    }

    AsyncFunction("getAttempt") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Attempt", recordName: "attempt-\(handle)")
    }

    AsyncFunction("listAttempts") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Attempt", limit: limit, after: after)
    }

    AsyncFunction("putResolution") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecordOnce(recordType: "Resolution", recordName: "resolve-\(handle)", fields: fields)
    }

    AsyncFunction("getResolution") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Resolution", recordName: "resolve-\(handle)")
    }

    AsyncFunction("listResolutions") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Resolution", limit: limit, after: after)
    }

    // --- Patch 6a: shared cash and refund notices ---
    // A notice is written once and never changed or deleted: reading or dismissing one is per device, so nothing about it is sent.
    // If one is already there it is handed back untouched.
    AsyncFunction("putNotice") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecordOnce(recordType: "Notice", recordName: "notice-\(handle)", fields: fields)
    }

    AsyncFunction("listNotices") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Notice", limit: limit, after: after)
    }

    // --- Patch 6c: training progress ---
    // One record per person per module, changed in place (a new mark or a reset). The JavaScript side joins before it writes.
    AsyncFunction("putTraining") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Training", recordName: "training-\(handle)", fields: fields)
    }

    AsyncFunction("listTraining") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Training", limit: limit, after: after)
    }

    // --- Patch 6c: the shared audit log ---
    // One record per logged event. The whole event is in the encrypted `secure_json`; the plain fields are labels (register, day, time, kind).
    // `listAuditIndex` asks CloudKit for the labels only, so a catch-up never downloads or decrypts the log itself.
    AsyncFunction("putAudit") { (handle: String, fields: [String: Any], encrypted: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Audit", recordName: "audit-\(handle)", fields: fields, encrypted: encrypted)
    }

    AsyncFunction("listAuditIndex") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Audit", limit: limit, after: after, desiredKeys: ["registerId", "registerName", "at", "day", "kind"])
    }

    AsyncFunction("listAudit") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Audit", limit: limit, after: after)
    }

    // --- Patch 6a: the shared logo ---
    // One record, `logo-current`, with the image as a CKAsset. A removal clears the asset and sets `removed`. The fields are read without
    // downloading the image, so the poll never pulls it down unless it has changed; `downloadLogo` fetches it on its own.
    AsyncFunction("putLogo") { (fields: [String: Any], filePath: String?) async throws -> [String: Any] in
      try await self.putLogo(fields: fields, filePath: filePath)
    }

    AsyncFunction("getLogo") { () async throws -> [String: Any]? in
      try await self.getLogoFields()
    }

    AsyncFunction("downloadLogo") { () async throws -> String? in
      try await self.downloadLogoFile()
    }

    // --- Patch 6a: the shared Square history ---
    // One `square-manifest` record lists the months. Each month is its own `squareshard-<month>-<id>` record with the packed file as a
    // CKAsset. A shard is written once and never changed, because its name holds the id of its content. Only the manifest is ever replaced,
    // and only if it is still at the change tag the caller read (the call returns `changed` instead of overwriting another register's write).
    AsyncFunction("putSquareShard") { (handle: String, fields: [String: Any], filePath: String) async throws -> [String: Any] in
      try await self.putSquareShardOnce(handle: handle, fields: fields, filePath: filePath)
    }

    AsyncFunction("getSquareManifest") { () async throws -> [String: Any]? in
      try await self.getSquareManifestFields()
    }

    AsyncFunction("putSquareManifest") { (fields: [String: Any], expectedTag: String?) async throws -> [String: Any] in
      try await self.putSquareManifest(fields: fields, expectedTag: expectedTag)
    }

    AsyncFunction("downloadSquareShard") { (handle: String) async throws -> String? in
      try await self.downloadSquareShardFile(handle: handle)
    }

    // --- Patch 5: saved carts ---
    AsyncFunction("putCart") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Cart", recordName: "cart-\(handle)", fields: fields)
    }

    AsyncFunction("getCart") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Cart", recordName: "cart-\(handle)")
    }

    AsyncFunction("listCarts") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Cart", limit: limit, after: after)
    }

    // --- Patch 6: settings, layout and square history shards ---
    AsyncFunction("putSettings") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Settings", recordName: "settings-\(handle)", fields: fields)
    }

    AsyncFunction("getSettings") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Settings", recordName: "settings-\(handle)")
    }

    AsyncFunction("listSettings") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Settings", limit: limit, after: after)
    }

    AsyncFunction("putLayout") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Layout", recordName: "layout-\(handle)", fields: fields)
    }

    AsyncFunction("getLayout") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Layout", recordName: "layout-\(handle)")
    }

    AsyncFunction("listLayout") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "Layout", limit: limit, after: after)
    }

    // Square history shards (month files)
    AsyncFunction("putSquareHistory") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "SquareHistory", recordName: "square-\(handle)", fields: fields)
    }

    AsyncFunction("getSquareHistory") { (handle: String) async throws -> [String: Any]? in
      try await self.getRecord(recordType: "SquareHistory", recordName: "square-\(handle)")
    }

    AsyncFunction("listSquareHistory") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "SquareHistory", limit: limit, after: after)
    }

    // --- Patch 7: the migration lease ---
    // `migration-v1` says which owner iPad is running the one-off import and how far it has got. It is never written unconditionally
    // (the old putMigration did that, and was removed in 0212): every write names the change tag the caller read, so only one iPad can win.
    AsyncFunction("getMigration") { () async throws -> [String: Any]? in
      try await self.getMigrationFields()
    }

    AsyncFunction("putMigrationIfUnchanged") { (fields: [String: Any], expectedTag: String?) async throws -> [String: Any] in
      try await self.putMigrationIfUnchanged(fields: fields, expectedTag: expectedTag)
    }

    // Patch 6b: the shared cash drawer. The shift and the checkpoint are single records that are updated in place; each
    // ledger entry is its own record, written once and never changed.
    AsyncFunction("putDrawerShift") { (fields: [String: Any]) async throws -> [String: Any] in
      try await self.upsertRecord(recordType: "DrawerShift", recordName: "drawer-shift", fields: fields)
    }

    AsyncFunction("getDrawerShift") { () async throws -> [String: Any]? in
      try await self.getRecord(recordType: "DrawerShift", recordName: "drawer-shift")
    }

    AsyncFunction("putLedgerEntry") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecordOnce(recordType: "LedgerEntry", recordName: "ledger-\(handle)", fields: fields)
    }

    AsyncFunction("listLedgerEntries") { (limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listRecords(recordType: "LedgerEntry", limit: limit, after: after)
    }

    AsyncFunction("listLedgerSince") { (since: Double, limit: Int, after: String?) async throws -> [String: Any] in
      try await self.listCreatedSince(recordType: "LedgerEntry", since: since, limit: limit, after: after)
    }

    AsyncFunction("putDrawerCheckpoint") { (fields: [String: Any]) async throws -> [String: Any] in
      try await self.upsertRecord(recordType: "DrawerCheckpoint", recordName: "drawer-checkpoint", fields: fields)
    }

    AsyncFunction("getDrawerCheckpoint") { () async throws -> [String: Any]? in
      try await self.getRecord(recordType: "DrawerCheckpoint", recordName: "drawer-checkpoint")
    }
  }

  // --- The container and the zone it shares ---------------------------------

  private func container() -> CKContainer { CKContainer(identifier: cloudKitContainerIdentifier) }

  private var storeZoneID: CKRecordZone.ID { CKRecordZone(zoneName: cloudKitZoneName).zoneID }

  private func accountStatus() async -> String {
    do {
      return CloudKitSyncModule.describe(try await container().accountStatus())
    } catch {
      return "couldNotDetermine"
    }
  }

  private func state() async -> CloudKitStateRecord {
    var state = CloudKitStateRecord()
    state.account = await accountStatus()
    let container = self.container()
    let zoneID = storeZoneID
    // The owner's own database carries the zone under its own name...
    if let zones = try? await container.privateCloudDatabase.allRecordZones(), zones.contains(where: { $0.zoneID == zoneID }) {
      state.role = "owner"
      if let link = try? await self.shareLink() { state.shareURL = link }
    // ...while a participant sees the same zone name in the shared database it accepted.
    } else if let zones = try? await container.sharedCloudDatabase.allRecordZones(), zones.contains(where: { $0.zoneID.zoneName == cloudKitZoneName }) {
      state.role = "participant"
    }
    return state
  }

  // The zone-wide share link, read back from the record the owner saved. Throws when the share has not been made yet.
  private func shareLink() async throws -> String {
    let id = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: storeZoneID)
    let record = try await container().privateCloudDatabase.record(for: id)
    guard let share = record as? CKShare, let url = share.url else {
      throw Exception(name: "noInviteLink", description: "There is no invite link yet.")
    }
    return url.absoluteString
  }

  private func createZoneAndShare() async throws -> String {
    let database = container().privateCloudDatabase
    let zoneID = storeZoneID
    let zones = (try? await database.allRecordZones()) ?? []
    if !zones.contains(where: { $0.zoneID == zoneID }) {
      _ = try await database.save(CKRecordZone(zoneID: zoneID))
    }
    // A link that already exists is reused, so setting up twice never strands the tills that already joined.
    if let link = try? await shareLink() { return link }
    let share = CKShare(recordZoneID: zoneID)
    // Read and write for anyone with the link: the invite is the door, and the owner can still revoke the share.
    share.publicPermission = .readWrite
    share[CKShare.SystemFieldKey.title] = "Aidens 3D POS" as CKRecordValue
    let saved = try await database.save(share)
    guard let created = saved as? CKShare, let url = created.url else {
      throw Exception(name: "noInviteLink", description: "CloudKit did not return an invite link. Try again.")
    }
    return url.absoluteString
  }

  // Accept a share iOS handed the app (a tap on the invite link), then tell the page if it is open.
  private func join(_ metadata: CKShare.Metadata) async {
    do {
      try await accept([metadata])
      UserDefaults.standard.removeObject(forKey: cloudKitPendingInviteKey)
      sendEvent("onShareJoined", ["ok": true, "message": "Joined the shop's shared records."] as [String: Any?])
    } catch {
      sendEvent("onShareJoined", ["ok": false, "message": error.localizedDescription] as [String: Any?])
    }
  }

  // Accept a share from a link someone typed or pasted.
  private func acceptShareURL(_ urlString: String) async throws {
    guard let url = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)) else {
      throw Exception(name: "badInviteLink", description: "That does not look like an invite link.")
    }
    let metadata = try await container().shareMetadata(for: url)
    try await accept([metadata])
    UserDefaults.standard.removeObject(forKey: cloudKitPendingInviteKey)
  }

  // `accept` reports per-share failures inside its result rather than throwing, so raise the first one.
  private func accept(_ metadatas: [CKShare.Metadata]) async throws {
    let results = try await container().accept(metadatas)
    for (_, result) in results {
      if case .failure(let error) = result { throw error }
    }
  }

  private static func describe(_ status: CKAccountStatus) -> String {
    switch status {
    case .available: return "available"
    case .noAccount: return "noAccount"
    case .restricted: return "restricted"
    case .couldNotDetermine: return "couldNotDetermine"
    case .temporarilyUnavailable: return "temporarilyUnavailable"
    @unknown default: return "couldNotDetermine"
    }
  }

  // --- Patch 6a helpers: the logo asset ---------------------------------------------------------------------

  private var logoRecordID: CKRecord.ID { CKRecord.ID(recordName: "logo-current", zoneID: storeZoneID) }

  /// Create or change the logo record. With a file path the image is attached as the asset; without one the asset is cleared (a removal).
  /// Goes through the same fetch, change, save and retry loop as upsertRecord, because the asset cannot be set through copyFields.
  private func putLogo(fields: [String: Any], filePath: String?) async throws -> [String: Any] {
    var lastError: Error?
    for _ in 0..<3 {
      let record: CKRecord
      do {
        record = try await database().record(for: logoRecordID)
      } catch let error as CKError where error.code == .unknownItem {
        record = makeRecord(recordType: "Logo", recordName: "logo-current")
      }
      copyFields(fields, into: record)
      if let filePath, !filePath.isEmpty {
        let url = filePath.hasPrefix("file://") ? (URL(string: filePath) ?? URL(fileURLWithPath: filePath)) : URL(fileURLWithPath: filePath)
        record["asset"] = CKAsset(fileURL: url)
      } else {
        record["asset"] = nil
      }
      do {
        let saved = try await database().save(record)
        return logoDict(saved)
      } catch let error as CKError where error.code == .serverRecordChanged {
        lastError = error
      }
    }
    throw lastError ?? NSError(domain: CKErrorDomain, code: CKError.Code.serverRecordChanged.rawValue)
  }

  /// The plain fields only. `desiredKeys` leaves the asset out of the fetch, so no image is downloaded.
  private func getLogoFields() async throws -> [String: Any]? {
    let plain = ["hash", "mime", "bytes", "removed", "ts", "registerId", "registerName"]
    let results = try await database().records(for: [logoRecordID], desiredKeys: plain)
    guard let result = results[logoRecordID] else { return nil }
    switch result {
    case .success(let record): return logoDict(record)
    case .failure(let error):
      if let ck = error as? CKError, ck.code == .unknownItem { return nil }
      throw error
    }
  }

  /// Fetch the record with its asset and copy the image to a temporary file the JavaScript side can read. The extension comes from the
  /// stored type, because the app tells image types apart by it. Null when the record has no image.
  private func downloadLogoFile() async throws -> String? {
    let record: CKRecord
    do { record = try await database().record(for: logoRecordID) }
    catch let error as CKError where error.code == .unknownItem { return nil }
    guard let asset = record["asset"] as? CKAsset, let source = asset.fileURL else { return nil }
    let mime = (record["mime"] as? String) ?? ""
    let ext = ["image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"][mime] ?? ""
    if ext.isEmpty { return nil }
    let dest = FileManager.default.temporaryDirectory.appendingPathComponent("shared-logo-\(UUID().uuidString).\(ext)")
    try FileManager.default.copyItem(at: source, to: dest)
    return dest.path
  }

  /// recordToDict without the asset, which would otherwise come back as the text of the object.
  private func logoDict(_ record: CKRecord) -> [String: Any] {
    var out = recordToDict(record); out.removeValue(forKey: "asset"); return out
  }

  // --- Patch 6a helpers: the Square history shards -------------------------------------------------------

  private var squareManifestID: CKRecord.ID { CKRecord.ID(recordName: "square-manifest", zoneID: storeZoneID) }

  /// A shard handle is `<YYYY-MM>-<id>`. Checked here as well as in JavaScript, because it becomes part of a record name and a file name.
  private func validShardHandle(_ handle: String) -> Bool {
    handle.range(of: "^[0-9]{4}-[0-9]{2}-[A-Za-z0-9_-]{1,40}$", options: .regularExpression) != nil
  }

  /// Write one month's shard. If the name is taken, the stored one is handed back untouched (the name holds the content's id, so it is the same file).
  private func putSquareShardOnce(handle: String, fields: [String: Any], filePath: String) async throws -> [String: Any] {
    guard validShardHandle(handle) else { throw NSError(domain: CKErrorDomain, code: CKError.Code.invalidArguments.rawValue) }
    let name = "squareshard-\(handle)"
    let record = makeRecord(recordType: "SquareShard", recordName: name)
    copyFields(fields, into: record)
    let url = filePath.hasPrefix("file://") ? (URL(string: filePath) ?? URL(fileURLWithPath: filePath)) : URL(fileURLWithPath: filePath)
    record["asset"] = CKAsset(fileURL: url)
    do {
      let saved = try await database().save(record)
      return squareDict(saved)
    } catch let error as CKError where error.code == .serverRecordChanged {
      let id = CKRecord.ID(recordName: name, zoneID: storeZoneID)
      return squareDict(try await database().record(for: id))
    }
  }

  /// The manifest's plain fields and CloudKit's change tag for it. Null when there is none.
  private func getSquareManifestFields() async throws -> [String: Any]? {
    let results = try await database().records(for: [squareManifestID])
    guard let result = results[squareManifestID] else { return nil }
    switch result {
    case .success(let record):
      var out = squareDict(record)
      out["tag"] = record.recordChangeTag ?? ""
      return out
    case .failure(let error):
      if let ck = error as? CKError, ck.code == .unknownItem { return nil }
      throw error
    }
  }

  /// Replace the manifest only if it is still the one the caller read. `expectedTag` is that record's change tag, or empty or nil when
  /// the caller saw no manifest. If another register wrote in between, nothing is written and `changed` is true.
  private func putSquareManifest(fields: [String: Any], expectedTag: String?) async throws -> [String: Any] {
    var found: CKRecord? = nil
    do { found = try await database().record(for: squareManifestID) }
    catch let error as CKError where error.code == .unknownItem { found = nil }
    let expected = expectedTag ?? ""
    let record: CKRecord
    if let current = found {
      guard !expected.isEmpty, current.recordChangeTag == expected else { return ["changed": true] }
      record = current
    } else {
      if !expected.isEmpty { return ["changed": true] }
      record = makeRecord(recordType: "SquareManifest", recordName: "square-manifest")
    }
    copyFields(fields, into: record)
    do {
      let saved = try await database().save(record)
      return ["changed": false, "tag": saved.recordChangeTag ?? ""]
    } catch let error as CKError where error.code == .serverRecordChanged {
      return ["changed": true]
    }
  }

  /// The migration record's plain fields and CloudKit's change tag for it (as `tag`). Null when there is none. recordToDict is not changed
  /// for this, because every other record type reads its fields straight into rows and a stray `tag` field would end up in them.
  private func getMigrationFields() async throws -> [String: Any]? {
    let id = CKRecord.ID(recordName: "migration-v1", zoneID: storeZoneID)
    do {
      let record = try await database().record(for: id)
      var out = recordToDict(record)
      out["tag"] = record.recordChangeTag ?? ""
      return out
    } catch let error as CKError where error.code == .unknownItem {
      return nil
    }
  }

  /// Write the migration record only if it is still the one the caller read. `expectedTag` is that record's change tag, or empty or nil
  /// when the caller saw no record (then it is created, and a record that has appeared in the meantime counts as changed). Same shape as
  /// putSquareManifest. If another iPad wrote in between, nothing is written and `changed` is true.
  private func putMigrationIfUnchanged(fields: [String: Any], expectedTag: String?) async throws -> [String: Any] {
    let id = CKRecord.ID(recordName: "migration-v1", zoneID: storeZoneID)
    var found: CKRecord? = nil
    do { found = try await database().record(for: id) }
    catch let error as CKError where error.code == .unknownItem { found = nil }
    let expected = expectedTag ?? ""
    let record: CKRecord
    if let current = found {
      guard !expected.isEmpty, current.recordChangeTag == expected else { return ["changed": true] }
      record = current
    } else {
      if !expected.isEmpty { return ["changed": true] }
      record = makeRecord(recordType: "Migration", recordName: "migration-v1")
    }
    var plain = fields
    plain["tag"] = nil // the tag is what a write has to match, never something stored
    copyFields(plain, into: record)
    do {
      let saved = try await database().save(record)
      return ["changed": false, "tag": saved.recordChangeTag ?? ""]
    } catch let error as CKError where error.code == .serverRecordChanged {
      return ["changed": true]
    }
  }

  /// Fetch one shard with its asset and copy the file to a temporary path the JavaScript side can read. Null when it is not there.
  private func downloadSquareShardFile(handle: String) async throws -> String? {
    guard validShardHandle(handle) else { return nil }
    let id = CKRecord.ID(recordName: "squareshard-\(handle)", zoneID: storeZoneID)
    let record: CKRecord
    do { record = try await database().record(for: id) }
    catch let error as CKError where error.code == .unknownItem { return nil }
    guard let asset = record["asset"] as? CKAsset, let source = asset.fileURL else { return nil }
    let dest = FileManager.default.temporaryDirectory.appendingPathComponent("square-shard-\(UUID().uuidString).json.gz")
    try FileManager.default.copyItem(at: source, to: dest)
    return dest.path
  }

  /// recordToDict without the asset, which would otherwise come back as the text of the object.
  private func squareDict(_ record: CKRecord) -> [String: Any] {
    var out = recordToDict(record); out.removeValue(forKey: "asset"); return out
  }

  // --- Patch 4 helpers -------------------------------------------------------

  private func database() -> CKDatabase {
    // Prefer private; roles may differ. For reading shared zone records the shared database is used by participants,
    // but this module will be called in the right context by the backend. Use private for now; the backend decides.
    container().privateCloudDatabase
  }

  private func makeRecord(recordType: String, recordName: String) -> CKRecord {
    let id = CKRecord.ID(recordName: recordName, zoneID: storeZoneID)
    return CKRecord(recordType: recordType, recordID: id)
  }

  private func recordToDict(_ record: CKRecord) -> [String: Any] {
    var out: [String: Any] = ["id": record.recordID.recordName, "recordName": record.recordID.recordName, "updatedAt": record.modificationDate?.timeIntervalSince1970 ?? 0, "createdAt": record.creationDate?.timeIntervalSince1970 ?? 0]
    for key in record.allKeys() {
      if let v = record[key] {
        if let s = v as? String { out[key] = s }
        else if let n = v as? NSNumber { out[key] = n }
        else if let d = v as? Date { out[key] = d.timeIntervalSince1970 }
        else { out[key] = String(describing: v) }
      }
    }
    // Encrypted values are not in allKeys(). A value this device cannot decrypt comes back nil and is simply absent, so the
    // record still reads, only without those fields.
    if let keys = cloudKitEncryptedKeys[record.recordType] {
      var enc: [String: Any] = [:]
      for key in keys { if let s = record.encryptedValues[key] as? String { enc[key] = s } }
      if !enc.isEmpty { out["encrypted"] = enc }
    }
    return out
  }

  /// Create or update the record with this name. It goes through upsertRecord because CloudKit refuses to save a fresh
  /// record over a name that already exists (serverRecordChanged), which made every second write of the same sale,
  /// rollup, cart, settings or layout record fail. Fields not mentioned are left as they were.
  private func putRecord(recordType: String, recordName: String, fields: [String: Any], encrypted: [String: Any] = [:]) async throws -> [String: Any] {
    try await upsertRecord(recordType: recordType, recordName: recordName, fields: fields, encrypted: encrypted)
  }

  private func copyFields(_ fields: [String: Any], into record: CKRecord) {
    for (k, v) in fields {
      if k == "id" || k == "recordName" || k == "updatedAt" || k == "createdAt" || k == "encrypted" { continue }
      if cloudKitNeverPlainKeys.contains(k) { continue } // an encrypted field is only ever written through `encrypted`
      if let s = v as? String { record[k] = s as CKRecordValue }
      else if let i = v as? Int { record[k] = NSNumber(value: i) }
      else if let d = v as? Double { record[k] = NSNumber(value: d) }
      else if let b = v as? Bool { record[k] = NSNumber(value: b) }
      else if v is NSNull { continue }
      else { record[k] = String(describing: v) as CKRecordValue }
    }
  }

  /// Write the encrypted values. Only the keys listed for the record's type are accepted, and only text, so a mistake in
  /// JavaScript cannot turn a plain field into an encrypted one or the other way round.
  private func copyEncrypted(_ encrypted: [String: Any], into record: CKRecord) {
    let allowed = cloudKitEncryptedKeys[record.recordType] ?? []
    for (k, v) in encrypted where allowed.contains(k) {
      if let s = v as? String { record.encryptedValues[k] = s }
    }
  }

  /// Create the record, or change the one that is there. putRecord above builds a fresh record every time, which CloudKit
  /// refuses for a name that already exists (serverRecordChanged), so anything that is updated in place goes through here:
  /// fetch the current record, change its fields, save, and try again if someone else saved in between.
  private func upsertRecord(recordType: String, recordName: String, fields: [String: Any], encrypted: [String: Any] = [:]) async throws -> [String: Any] {
    let id = CKRecord.ID(recordName: recordName, zoneID: storeZoneID)
    var lastError: Error?
    for _ in 0..<3 {
      let record: CKRecord
      do {
        record = try await database().record(for: id)
      } catch let error as CKError where error.code == .unknownItem {
        record = makeRecord(recordType: recordType, recordName: recordName)
      }
      copyFields(fields, into: record)
      copyEncrypted(encrypted, into: record)
      do {
        let saved = try await database().save(record)
        return recordToDict(saved)
      } catch let error as CKError where error.code == .serverRecordChanged {
        lastError = error
      }
    }
    throw lastError ?? NSError(domain: CKErrorDomain, code: CKError.Code.serverRecordChanged.rawValue)
  }

  /// Write a record that must never change once it exists (a ledger entry). If it is already there, hand back the stored
  /// one untouched, so a retry or a second register uploading the same entry is harmless.
  private func putRecordOnce(recordType: String, recordName: String, fields: [String: Any]) async throws -> [String: Any] {
    let record = makeRecord(recordType: recordType, recordName: recordName)
    copyFields(fields, into: record)
    do {
      let saved = try await database().save(record)
      return recordToDict(saved)
    } catch let error as CKError where error.code == .serverRecordChanged {
      let id = CKRecord.ID(recordName: recordName, zoneID: storeZoneID)
      return recordToDict(try await database().record(for: id))
    }
  }

  /// Records of a type created after `since` (seconds since 1970), oldest first. Reads on the creation time, which
  /// CloudKit sets itself, so a record uploaded late by an offline iPad is found by the checkpoint logic in JavaScript.
  private func listCreatedSince(recordType: String, since: Double, limit: Int, after: String?) async throws -> [String: Any] {
    let date = Date(timeIntervalSince1970: since)
    let query = CKQuery(recordType: recordType, predicate: NSPredicate(format: "creationDate > %@", date as NSDate))
    query.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
    return try await runQuery(query, limit: limit, after: after)
  }

  private func getRecord(recordType: String, recordName: String) async throws -> [String: Any]? {
    let id = CKRecord.ID(recordName: recordName, zoneID: storeZoneID)
    do {
      let record = try await database().record(for: id)
      return recordToDict(record)
    } catch let error as CKError {
      if error.code == .unknownItem { return nil }
      throw error
    }
  }

  private func listRecords(recordType: String, limit: Int, after: String?, desiredKeys: [String]? = nil) async throws -> [String: Any] {
    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    query.sortDescriptors = [NSSortDescriptor(key: "modificationDate", ascending: false)]
    return try await runQuery(query, limit: limit, after: after, desiredKeys: desiredKeys)
  }

  /// `desiredKeys` limits which fields CloudKit sends back (nil means all). Encrypted values are left out when it is set, so a caller that only needs
  /// labels never downloads or decrypts the content.
  private func runQuery(_ query: CKQuery, limit: Int, after: String?, desiredKeys: [String]? = nil) async throws -> [String: Any] {
    let db = database()
    var rows: [[String: Any]] = []
    var cursor: CKQueryOperation.Cursor? = nil
    if let after, !after.isEmpty {
      if let data = Data(base64Encoded: after) {
        cursor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKQueryOperation.Cursor.self, from: data)
      }
    }
    var results: (matchResults: [(CKRecord.ID, Result<CKRecord, Error>)], queryCursor: CKQueryOperation.Cursor?)
    if let c = cursor {
      results = try await db.records(continuingMatchFrom: c, desiredKeys: desiredKeys, resultsLimit: limit)
    } else {
      results = try await db.records(matching: query, inZoneWith: storeZoneID, desiredKeys: desiredKeys, resultsLimit: limit)
    }
    for (_, res) in results.matchResults {
      if case .success(let record) = res {
        rows.append(recordToDict(record))
      }
    }
    var next: Any = NSNull()
    if let qc = results.queryCursor {
      if let data = try? NSKeyedArchiver.archivedData(withRootObject: qc, requiringSecureCoding: true) {
        next = data.base64EncodedString()
      }
    }
    return ["rows": rows, "next": next]
  }
}
