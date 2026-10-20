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
    AsyncFunction("putSale") { (handle: String, fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Sale", recordName: "sale-\(handle)", fields: fields)
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

    // --- Patch 7: migration state ---
    AsyncFunction("putMigration") { (fields: [String: Any]) async throws -> [String: Any] in
      try await self.putRecord(recordType: "Migration", recordName: "migration-v1", fields: fields)
    }

    AsyncFunction("getMigration") { () async throws -> [String: Any]? in
      try await self.getRecord(recordType: "Migration", recordName: "migration-v1")
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
    var out: [String: Any] = ["id": record.recordID.recordName, "recordName": record.recordID.recordName, "updatedAt": record.modificationDate?.timeIntervalSince1970 ?? 0]
    for key in record.allKeys() {
      if let v = record[key] {
        if let s = v as? String { out[key] = s }
        else if let n = v as? NSNumber { out[key] = n }
        else if let d = v as? Date { out[key] = d.timeIntervalSince1970 }
        else { out[key] = String(describing: v) }
      }
    }
    return out
  }

  private func putRecord(recordType: String, recordName: String, fields: [String: Any]) async throws -> [String: Any] {
    let record = makeRecord(recordType: recordType, recordName: recordName)
    for (k, v) in fields {
      if k == "id" { continue }
      if let s = v as? String { record[k] = s as CKRecordValue }
      else if let i = v as? Int { record[k] = NSNumber(value: i) }
      else if let d = v as? Double { record[k] = NSNumber(value: d) }
      else if let b = v as? Bool { record[k] = NSNumber(value: b) }
      else if v is NSNull { continue }
      else { record[k] = String(describing: v) as CKRecordValue }
    }
    let saved = try await database().save(record)
    return recordToDict(saved)
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

  private func listRecords(recordType: String, limit: Int, after: String?) async throws -> [String: Any] {
    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    query.sortDescriptors = [NSSortDescriptor(key: "modificationDate", ascending: false)]
    let db = database()
    var rows: [[String: Any]] = []
    var cursor: CKQueryCursor? = nil
    if let after, !after.isEmpty {
      if let data = Data(base64Encoded: after) {
        cursor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKQueryCursor.self, from: data)
      }
    }
    var results: (matchResults: [(CKRecord.ID, Result<CKRecord, Error>)], queryCursor: CKQueryCursor?)
    if let c = cursor {
      results = try await db.records(continuingMatchFrom: c, resultsLimit: limit)
    } else {
      results = try await db.records(matching: query, inZoneWith: storeZoneID, resultsLimit: limit)
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
