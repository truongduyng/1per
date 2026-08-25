require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'OnePerVideoComposer'
  s.version        = package['version']
  s.summary        = 'A video composition module for OnePer'
  s.description    = 'A video composition module for OnePer'
  s.license        = 'MIT'
  s.author         = ''
  s.homepage       = 'https://github.com/expo/expo'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
