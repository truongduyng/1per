import SwiftUI
import WidgetKit

private let appGroup = "group.app.kadoze.yikudo"
private let storageKey = "dailyAffirmation"

struct DailyAffirmationEntry: TimelineEntry {
  let date: Date
  let affirmation: String
  let dayLabel: String
}

struct DailyAffirmationProvider: TimelineProvider {
  func placeholder(in context: Context) -> DailyAffirmationEntry {
    DailyAffirmationEntry(
      date: Date(),
      affirmation: "I can make today lighter by choosing the next honest step.",
      dayLabel: "Today"
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (DailyAffirmationEntry) -> Void) {
    completion(readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DailyAffirmationEntry>) -> Void) {
    let nextRefresh = Calendar.current.date(byAdding: .hour, value: 3, to: Date()) ?? Date()
    completion(Timeline(entries: [readEntry()], policy: .after(nextRefresh)))
  }

  private func readEntry() -> DailyAffirmationEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    let payload = defaults?.dictionary(forKey: storageKey)
    let affirmation = payload?["text"] as? String
    let dayLabel = payload?["dayLabel"] as? String

    return DailyAffirmationEntry(
      date: Date(),
      affirmation: affirmation ?? "The next right action is enough.",
      dayLabel: dayLabel ?? "Today"
    )
  }
}

struct DailyAffirmationWidgetView: View {
  @Environment(\.widgetFamily) private var family

  var entry: DailyAffirmationEntry

  var body: some View {
    VStack(alignment: .leading, spacing: family == .systemSmall ? 8 : 12) {
      HStack(spacing: 6) {
        Image(systemName: "sun.max.fill")
          .font(.system(size: family == .systemSmall ? 13 : 15, weight: .bold, design: .rounded))
          .foregroundStyle(Color("affirmationMuted"))
        Text(entry.dayLabel.uppercased())
          .font(.system(size: family == .systemSmall ? 13 : 14, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("affirmationMuted"))
          .lineLimit(1)
      }

      Text(entry.affirmation)
        .font(.system(size: family == .systemSmall ? 16 : 22, weight: .heavy, design: .rounded))
        .foregroundStyle(Color("affirmationInk"))
        .lineLimit(family == .systemSmall ? 4 : 3)
        .minimumScaleFactor(0.82)
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: false, vertical: true)
        .layoutPriority(1)

      Spacer(minLength: 0)

      HStack(spacing: 6) {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
          .fill(Color("affirmationMuted"))
          .frame(width: 6, height: 6)

        Text("1Per")
          .font(.system(size: family == .systemSmall ? 15 : 17, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("affirmationMuted"))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(family == .systemSmall ? 14 : 18)
    .containerBackground(for: .widget) {
      LinearGradient(
        colors: [
          Color(red: 1.0, green: 0.969, blue: 0.933),
          Color("affirmationMuted").opacity(0.18),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    }
  }
}

@main
struct DailyAffirmationWidget: Widget {
  let kind = "DailyAffirmationWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DailyAffirmationProvider()) { entry in
      DailyAffirmationWidgetView(entry: entry)
    }
    .configurationDisplayName("Daily Affirmation")
    .description("A calm daily reminder from 1Per.")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}
