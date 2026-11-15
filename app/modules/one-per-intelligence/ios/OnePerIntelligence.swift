import ExpoModulesCore
import Foundation

#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
@Generable
struct JournalAnalysis {
  @Guide(description: "The id of the habit this message reports having actually done today, or -1 if it does not clearly report completing one of the listed habits. Plans, wishes, questions and to-dos are -1.")
  var habitId: Int

  @Guide(description: "Zero to three short lowercase topic tags (one or two words each) that describe the message. Prefer reusing an existing tag when it fits.")
  var tags: [String]
}
#endif

/// On-device journal analysis. Everything runs locally through Apple's
/// Foundation Models framework; when it is unavailable (older iOS, Apple
/// Intelligence off, unsupported device) `isAvailable` returns false and the
/// JS side falls back to its keyword matcher.
public final class OnePerIntelligence: Module {
  public func definition() -> ModuleDefinition {
    Name("OnePerIntelligence")

    Function("isAvailable") { () -> Bool in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        if case .available = SystemLanguageModel.default.availability {
          return true
        }
      }
      #endif
      return false
    }

    AsyncFunction("analyzeAsync") { (text: String, habits: [[String: Any]], knownTags: [String]) async throws -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return try await Self.analyze(text: text, habits: habits, knownTags: knownTags)
      }
      #endif
      throw NSError(
        domain: "OnePerIntelligence",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "On-device model is not available."]
      )
    }
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, *)
  private static func analyze(text: String, habits: [[String: Any]], knownTags: [String]) async throws -> [String: Any] {
    let habitLines = habits.compactMap { habit -> String? in
      guard let id = (habit["id"] as? NSNumber)?.intValue, let title = habit["title"] as? String else { return nil }
      let subtitle = (habit["subtitle"] as? String).map { " (\($0))" } ?? ""
      return "- id \(id): \(title)\(subtitle)"
    }.joined(separator: "\n")

    let instructions = """
      You organize a private journal where a person messages themselves. \
      For each message, decide whether it reports having completed one of their habits, \
      and pick a few short topic tags. Be conservative with habits: only match when the \
      message clearly says the habit was done. Tags are lowercase, one or two words.
      """
    let prompt = """
      Habits:
      \(habitLines.isEmpty ? "(none)" : habitLines)

      Existing tags: \(knownTags.isEmpty ? "(none)" : knownTags.prefix(40).joined(separator: ", "))

      Message:
      \(text.prefix(2000))
      """

    let session = LanguageModelSession(instructions: instructions)
    let response = try await session.respond(to: prompt, generating: JournalAnalysis.self)
    return [
      "habitId": response.content.habitId,
      "tags": response.content.tags,
    ]
  }
  #endif
}
