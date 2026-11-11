// Location: tests/cloudkitplugin.test.ts
// The AppDelegate half of plugins/withCloudKit.js (patch 2 of dev_docs/CLOUDKIT_SYNC_PLAN.md). CloudKit hands the app a
// share link through a delegate call that Expo does not forward, so the plugin writes that method into the generated
// AppDelegate. This checks the text it writes, so a mistake is caught without a native build.
//
// The template below is the real shape: AppDelegate first, then a second class (ReactNativeDelegate). That second class
// is why the method cannot simply go before the file's last brace; the tests below pin that down.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { injectShareLinkHandler } = require('../plugins/withCloudKit') as {
  injectShareLinkHandler: (contents: string, language?: string) => string;
};

const TEMPLATE = [
  'import Expo',
  'import React',
  '',
  '@UIApplicationMain',
  'public class AppDelegate: ExpoAppDelegate {',
  '  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {',
  '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
  '  }',
  '}',
  '',
  'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {',
  '  override func bundleURL() -> URL? {',
  '    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
  '  }',
  '}',
  '',
].join('\n');

const SECOND_CLASS = 'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate';

test('the share link method is written into the AppDelegate', () => {
  const out = injectShareLinkHandler(TEMPLATE);
  assert.match(out, /userDidAcceptCloudKitShareWith metadata: CKShare\.Metadata/);
  assert.match(out, /@objc public func application\(/);
  assert.match(out, /import CloudKit/);
  assert.match(out, /UserDefaults\.standard\.set\(url, forKey: "cloudkitPendingInvite"\)/);
  assert.match(out, /Notification\.Name\("cloudkitDidAcceptShare"\)/);
});

test('the method lands inside AppDelegate, not in the class that follows it', () => {
  const out = injectShareLinkHandler(TEMPLATE);
  const at = out.indexOf('userDidAcceptCloudKitShareWith');
  assert.ok(out.indexOf('class ReactNativeDelegate') > out.indexOf('public class AppDelegate'), 'the template order changed');
  assert.ok(out.indexOf('class ReactNativeDelegate') > out.indexOf('didFinishLaunchingWithOptions'), 'the template shape changed');
  assert.ok(out.indexOf('didFinishLaunchingWithOptions') < at, 'the method must come after AppDelegate starts');
  assert.ok(at < out.indexOf('class ReactNativeDelegate'), 'the method must be inside AppDelegate, not the class after it');
});

test('the class body is found by matching braces, not by the last brace in the file', () => {
  const out = injectShareLinkHandler(TEMPLATE);
  const appDelegateClose = out.indexOf('\n}', out.indexOf('class AppDelegate'));
  assert.ok(appDelegateClose > 0);
  assert.ok(out.indexOf('userDidAcceptCloudKitShareWith') < appDelegateClose);
});

test('running it twice adds nothing the second time', () => {
  const once = injectShareLinkHandler(TEMPLATE);
  assert.equal(injectShareLinkHandler(once), once);
});

test('an AppDelegate that already imports CloudKit does not get a second import', () => {
  const out = injectShareLinkHandler(TEMPLATE.replace('import Expo', 'import Expo\nimport CloudKit'));
  assert.equal((out.match(/^\s*import CloudKit\s*$/gm) ?? []).length, 1);
});

test('a file with no AppDelegate is left alone rather than mangled', () => {
  const other = 'class SomethingElse {\n}\n';
  assert.equal(injectShareLinkHandler(other), other);
});

// ---- 8b: the push entitlement ----
const { applyEntitlements } = require('../plugins/withCloudKit') as { applyEntitlements: (e: Record<string, unknown>) => Record<string, unknown> };
test('the entitlements carry the container, CloudKit and the push environment', () => {
  const e = applyEntitlements({});
  assert.deepEqual(e['com.apple.developer.icloud-container-identifiers'], ['iCloud.com.aidens3dp.pos']); assert.deepEqual(e['com.apple.developer.icloud-services'], ['CloudKit']);
  assert.equal(e['aps-environment'], 'development');
});
test('an aps-environment already set is kept, and running twice changes nothing', () => {
  assert.equal(applyEntitlements({ 'aps-environment': 'production' })['aps-environment'], 'production');
  const once = applyEntitlements({ other: 1 }); assert.deepEqual(applyEntitlements({ ...once }), once);
});
test('an Objective-C AppDelegate is left alone rather than having Swift written into it', () => {
  const objc = '@implementation AppDelegate\n@end\n';
  assert.equal(injectShareLinkHandler(objc, 'objc'), objc);
});

// 0231: Xcode 27 builds for iOS 15.0 and up only, so pod targets that still ask for less are lifted from inside the Podfile's post_install.
const { injectPodsTarget } = require('../plugins/withCloudKit') as { injectPodsTarget: (contents: string) => string };
const PODFILE = [
  "target 'aidens3dpos' do",
  '  use_expo_modules!',
  '  post_install do |installer|',
  '    react_native_post_install(',
  '      installer,',
  "      config[:reactNativePath],",
  '      :mac_catalyst_enabled => false',
  '    )',
  '  end',
  'end',
  '',
].join('\n');
test('the Podfile gets a loop that lifts pod targets below iOS 15, inside post_install and before the React Native call', () => {
  const out = injectPodsTarget(PODFILE);
  assert.ok(out.includes("if v && v.to_f < 15.0"));
  assert.ok(out.includes("= '17.0' if"));
  assert.ok(out.indexOf('installer.pods_project.targets.each') > out.indexOf('post_install do |installer|'));
  assert.ok(out.indexOf('installer.pods_project.targets.each') < out.indexOf('react_native_post_install('));
});
test('the Podfile edit is made once, and a Podfile with no post_install is left alone', () => {
  const once = injectPodsTarget(PODFILE);
  assert.equal(injectPodsTarget(once), once);
  assert.equal(injectPodsTarget("target 'x' do\nend\n"), "target 'x' do\nend\n");
});

// 0232: the UIScene lifecycle. This is the shape of the Expo SDK 54 template's AppDelegate.swift (the window and startReactNative block is
// what the plugin has to find). The tests check the text, since the Swift is not compiled here.
const { injectSceneLifecycle, applySceneManifest } = require('../plugins/withCloudKit') as {
  injectSceneLifecycle: (contents: string, language?: string) => string;
  applySceneManifest: (plist: Record<string, unknown>) => Record<string, any>;
};
const SDK54 = [
  'import Expo',
  'import React',
  'import ReactAppDependencyProvider',
  '',
  '@UIApplicationMain',
  'public class AppDelegate: ExpoAppDelegate {',
  '  var window: UIWindow?',
  '',
  '  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?',
  '  var reactNativeFactory: RCTReactNativeFactory?',
  '',
  '  public override func application(',
  '    _ application: UIApplication,',
  '    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil',
  '  ) -> Bool {',
  '    let delegate = ReactNativeDelegate()',
  '    bindReactNativeFactory(factory)',
  '',
  '#if os(iOS) || os(tvOS)',
  '    window = UIWindow(frame: UIScreen.main.bounds)',
  '    factory.startReactNative(',
  '      withModuleName: "main",',
  '      in: window,',
  '      launchOptions: launchOptions)',
  '#endif',
  '',
  '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
  '  }',
  '}',
  '',
  'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {',
  '}',
  '',
].join('\n');

test('the scene manifest names a SceneDelegate in the app module and allows one scene', () => {
  const m = applySceneManifest({ CFBundleVersion: '1' });
  assert.equal(m.CFBundleVersion, '1');
  assert.equal(m.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes, false);
  const cfg = m.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.equal(cfg.length, 1); assert.equal(cfg[0].UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
});
test('the AppDelegate stops making the window, and a SceneDelegate starts React Native in one', () => {
  const out = injectSceneLifecycle(SDK54);
  const appPart = out.slice(0, out.indexOf('class SceneDelegate'));
  assert.ok(!/UIWindow\(frame/.test(appPart)); assert.ok(!/startReactNative/.test(appPart));
  assert.ok(appPart.includes('launchOptionsForScene = launchOptions'));
  assert.ok(appPart.includes('var launchOptionsForScene: [UIApplication.LaunchOptionsKey: Any]?'));
  assert.ok(/class SceneDelegate: UIResponder, UIWindowSceneDelegate/.test(out));
  assert.ok(/UIWindow\(windowScene: windowScene\)/.test(out)); assert.ok(/factory\.startReactNative\(withModuleName: "main", in: window/.test(out));
  assert.ok(/import CloudKit/.test(out));
});
test('the SceneDelegate hands links to the AppDelegate and records a CloudKit share link', () => {
  const out = injectSceneLifecycle(SDK54);
  assert.ok(/openURLContexts/.test(out)); assert.ok(/appDelegate\.application\(UIApplication\.shared, open: context\.url/.test(out));
  assert.ok(/continue userActivity: NSUserActivity/.test(out));
  assert.ok(/windowScene\(_ windowScene: UIWindowScene, userDidAcceptCloudKitShareWith metadata: CKShare\.Metadata\)/.test(out));
  assert.ok(/connectionOptions\.cloudKitShareMetadata/.test(out));
  assert.ok(out.includes('forKey: "cloudkitPendingInvite"')); assert.ok(out.includes('Notification.Name("cloudkitDidAcceptShare")'));
});
test('the scene edit is made once, and an unknown AppDelegate fails loudly instead of leaving a black screen', () => {
  const once = injectSceneLifecycle(SDK54);
  assert.equal(injectSceneLifecycle(once), once);
  assert.throws(() => injectSceneLifecycle('import Expo\nclass AppDelegate {}\n'), /does not look like the Expo SDK 54 template/);
  assert.throws(() => injectSceneLifecycle(SDK54, 'objc'), /only written into a Swift AppDelegate/);
});
test('the scene edit and the existing share-link method can both be applied, in either order', () => {
  const a = injectSceneLifecycle(injectShareLinkHandler(SDK54));
  const b = injectShareLinkHandler(injectSceneLifecycle(SDK54));
  for (const out of [a, b]) { assert.ok(out.includes('class SceneDelegate')); assert.ok(out.includes('userDidAcceptCloudKitShareWith')); }
  assert.equal((a.match(/import CloudKit/g) ?? []).length, 1); assert.equal((b.match(/import CloudKit/g) ?? []).length, 1);
});

