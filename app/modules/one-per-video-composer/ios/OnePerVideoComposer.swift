import AVFoundation
import ExpoModulesCore
import UIKit

public final class OnePerVideoComposer: Module {
  public func definition() -> ModuleDefinition {
    Name("OnePerVideoComposer")

    AsyncFunction("composeAsync") { (options: [String: Any]) async throws -> String in
      let videoUris = options["videoUris"] as? [String] ?? []
      let speed = max(0.25, min(options["speed"] as? Double ?? 1.0, 8.0))
      let goal = options["goal"] as? String ?? ""
      let logoUri = options["logoUri"] as? String
      let durationSeconds = max(1, options["durationSeconds"] as? Double ?? 1)

      guard !videoUris.isEmpty else {
        throw NSError(domain: "OnePerVideoComposer", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video segments were provided."])
      }

      return try await compose(videoUris: videoUris, speed: speed, goal: goal, logoUri: logoUri, durationSeconds: durationSeconds)
    }
  }

  private func compose(videoUris: [String], speed: Double, goal: String, logoUri: String?, durationSeconds: Double) async throws -> String {
    let assets = videoUris.map { AVURLAsset(url: mediaURL($0)) }
    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw NSError(domain: "OnePerVideoComposer", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to create video track."])
    }
    let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    var cursor = CMTime.zero
    var renderSize = CGSize(width: 1080, height: 1920)

    for asset in assets {
      guard let sourceVideo = try await asset.loadTracks(withMediaType: .video).first else { continue }
      let range = try await sourceVideo.load(.timeRange)
      try videoTrack.insertTimeRange(range, of: sourceVideo, at: cursor)
      if let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first {
        try audioTrack?.insertTimeRange(range, of: sourceAudio, at: cursor)
      }
      renderSize = try await sourceVideo.load(.naturalSize)
      cursor = CMTimeAdd(cursor, range.duration)
    }

    let originalDuration = cursor
    guard originalDuration.seconds > 0 else {
      throw NSError(domain: "OnePerVideoComposer", code: 3, userInfo: [NSLocalizedDescriptionKey: "Video segments are empty."])
    }
    let outputDuration = CMTimeMultiplyByFloat64(originalDuration, multiplier: 1.0 / speed)
    composition.scaleTimeRange(CMTimeRange(start: .zero, duration: originalDuration), toDuration: outputDuration)

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = [makeInstruction(track: videoTrack, duration: outputDuration)]

    let parent = CALayer()
    let videoLayer = CALayer()
    parent.frame = CGRect(origin: .zero, size: renderSize)
    videoLayer.frame = parent.frame
    parent.addSublayer(videoLayer)
    parent.addSublayer(makeBrandLayer(renderSize: renderSize, goal: goal, logoUri: logoUri, duration: outputDuration, sourceDuration: durationSeconds, speed: speed))
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let outputURL = documents.appendingPathComponent("oneper-\(UUID().uuidString).mp4")
    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw NSError(domain: "OnePerVideoComposer", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unable to create video exporter."])
    }
    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.videoComposition = videoComposition
    await withCheckedContinuation { continuation in
      exporter.exportAsynchronously {
        continuation.resume()
      }
    }
    guard exporter.status == .completed else {
      throw exporter.error ?? NSError(domain: "OnePerVideoComposer", code: 5, userInfo: [NSLocalizedDescriptionKey: "Video export failed."])
    }
    return outputURL.path
  }

  private func makeInstruction(track: AVAssetTrack, duration: CMTime) -> AVMutableVideoCompositionInstruction {
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
    layer.setOpacity(1, at: .zero)
    instruction.layerInstructions = [layer]
    return instruction
  }

  private func mediaURL(_ value: String) -> URL {
    if let url = URL(string: value), url.isFileURL {
      return url
    }
    return URL(fileURLWithPath: value)
  }

  private func makeBrandLayer(renderSize: CGSize, goal: String, logoUri: String?, duration: CMTime, sourceDuration: Double, speed: Double) -> CALayer {
    let layer = CALayer()
    layer.frame = CGRect(origin: .zero, size: renderSize)

    if let logoUri, let image = UIImage(contentsOfFile: URL(fileURLWithPath: logoUri).path)?.cgImage {
      let logo = CALayer()
      logo.contents = image
      logo.contentsGravity = .resizeAspect
      logo.frame = CGRect(x: 48, y: 48, width: 72, height: 72)
      layer.addSublayer(logo)
    }

    let brand = textLayer("1Per", size: 38, color: .white)
    brand.frame = CGRect(x: 132, y: 58, width: 300, height: 52)
    layer.addSublayer(brand)

    let goalLayer = textLayer(goal, size: 30, color: .white)
    goalLayer.alignmentMode = .center
    goalLayer.frame = CGRect(x: 48, y: renderSize.height - 150, width: renderSize.width - 96, height: 56)
    layer.addSublayer(goalLayer)

    let timer = textLayer("00:00", size: 44, color: .white)
    timer.alignmentMode = .center
    timer.frame = CGRect(x: 48, y: renderSize.height - 230, width: renderSize.width - 96, height: 64)
    let frameCount = max(1, Int(ceil(sourceDuration)))
    let values = (0...frameCount).map { index in
      let seconds = min(sourceDuration, Double(index))
      return formatTime(max(0, sourceDuration - seconds))
    }
    let animation = CAKeyframeAnimation(keyPath: "string")
    animation.values = values
    animation.keyTimes = values.indices.map { NSNumber(value: Double($0) / Double(max(1, values.count - 1))) }
    animation.duration = duration.seconds
    timer.add(animation, forKey: "timer")
    layer.addSublayer(timer)
    return layer
  }

  private func textLayer(_ text: String, size: CGFloat, color: UIColor) -> CATextLayer {
    let layer = CATextLayer()
    layer.string = text
    layer.font = UIFont.systemFont(ofSize: size, weight: .bold)
    layer.fontSize = size
    layer.foregroundColor = color.cgColor
    layer.contentsScale = UIScreen.main.scale
    return layer
  }

  private func formatTime(_ seconds: Double) -> String {
    let total = Int(seconds)
    return String(format: "%02d:%02d", total / 60, total % 60)
  }
}
