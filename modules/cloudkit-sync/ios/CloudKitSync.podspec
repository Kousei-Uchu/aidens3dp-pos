Pod::Spec.new do |s|
  s.name           = 'CloudKitSync'
  s.version        = '1.0.0'
  s.summary        = 'CloudKit sync for the POS.'
  s.description    = 'A small Expo module that wraps CloudKit (CKSyncEngine) so every till can share one store.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: 'https://github.com/expo/expo.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
