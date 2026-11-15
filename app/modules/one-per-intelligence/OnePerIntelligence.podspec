require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'OnePerIntelligence'
  s.version        = package['version']
  s.summary        = 'On-device journal analysis for OnePer (Apple Foundation Models)'
  s.description    = 'Matches journal messages to habits and suggests tags using the on-device Apple Intelligence model, when available.'
  s.license        = 'MIT'
  s.author         = ''
  s.homepage       = 'https://github.com/expo/expo'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  # FoundationModels only exists on iOS 26+; weak-link it so older devices still launch.
  s.weak_frameworks = 'FoundationModels'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
