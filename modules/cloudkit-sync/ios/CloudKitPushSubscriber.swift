import ExpoModulesCore
import CloudKit
import UIKit

// Patch 8b: receives the silent push CloudKit sends when the shop's records change (the subscriptions are made by CloudKitSyncModule's
// startSubscriptions). Expo forwards this delegate call to every subscriber listed in expo-module.config.json, so nothing needs writing into
// the generated AppDelegate for it (unlike the share link handler in plugins/withCloudKit.js, which Expo does not forward).
// It only posts a notification. CloudKitSyncModule turns that into the onRemoteChange event, and JavaScript decides whether to read.
// A push that is not a CloudKit database change is not handled here and is reported as no data, so other subscribers (for example
// notifications) keep their own results.
public class CloudKitPushSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    guard let note = CKNotification(fromRemoteNotificationDictionary: userInfo), note.notificationType == .database else {
      completionHandler(.noData)
      return
    }
    NotificationCenter.default.post(name: cloudKitRemoteChangeNotification, object: nil)
    completionHandler(.newData)
  }
}
