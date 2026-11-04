import AppIntents
import SwiftUI
import WidgetKit

let appGroup = "group.app.kadoze.yikudo"
let goalHabitsStorageKey = "goalHabitsSnapshot"
private let affirmationStorageKey = "dailyAffirmation"
private let pendingTogglesKey = "pendingHabitToggles"
private let yearProgressStorageKey = "yearProgressSnapshot"
private let maxHabitsShown = 3

// Tapping a habit row can't write to the app's SQLite database from the
// widget extension process, so it just flips the habit's id in this
// App-Group-backed pending list for optimistic display, and reloads the
// widget's timeline. The app reconciles the list into the database (via
// completionOps) and clears it next time it comes to the foreground.
struct ToggleHabitDoneIntent: AppIntent {
  static var title: LocalizedStringResource = "Toggle habit done"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Habit ID")
  var habitId: Int

  init() {}

  init(habitId: Int) {
    self.habitId = habitId
  }

  func perform() async throws -> some IntentResult {
    let defaults = UserDefaults(suiteName: appGroup)
    var pending = Set(readPendingToggles(from: defaults))
    if !pending.insert(habitId).inserted {
      pending.remove(habitId)
    }
    if let data = try? JSONSerialization.data(withJSONObject: Array(pending)) {
      defaults?.set(data, forKey: pendingTogglesKey)
    }

    WidgetCenter.shared.reloadTimelines(ofKind: "GoalHabitsWidget")
    WidgetCenter.shared.reloadTimelines(ofKind: "OverviewWidget")
    WidgetCenter.shared.reloadTimelines(ofKind: "TodayTimelineWidget")
    return .result()
  }
}

func readPendingToggles(from defaults: UserDefaults?) -> [Int] {
  guard let data = defaults?.data(forKey: pendingTogglesKey) else { return [] }
  guard let raw = try? JSONSerialization.jsonObject(with: data) as? [Int] else { return [] }
  return raw
}

struct GoalHabitsWidgetHabit: Identifiable {
  let id: Int
  let title: String
  let done: Bool
}

struct GoalHabitsEntry: TimelineEntry {
  let date: Date
  let goalText: String
  let goalDone: Bool
  let habits: [GoalHabitsWidgetHabit]
}

struct OverviewEntry: TimelineEntry {
  let date: Date
  let affirmation: String
  let dayLabel: String
  let goalText: String
  let goalDone: Bool
  let habits: [GoalHabitsWidgetHabit]
}

struct GoalHabitsProvider: TimelineProvider {
  func placeholder(in context: Context) -> GoalHabitsEntry {
    GoalHabitsEntry(
      date: Date(),
      goalText: "Write your main task for today",
      goalDone: false,
      habits: [
        GoalHabitsWidgetHabit(id: 1, title: "Morning walk", done: true),
        GoalHabitsWidgetHabit(id: 2, title: "Read 10 pages", done: false),
        GoalHabitsWidgetHabit(id: 3, title: "Drink water", done: false),
      ]
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (GoalHabitsEntry) -> Void) {
    completion(readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<GoalHabitsEntry>) -> Void) {
    // The app pushes a fresh snapshot (and requests a reload) on every relevant
    // change, so this periodic refresh only needs to catch up on anything
    // missed while the app wasn't running.
    let nextRefresh = Date().addingTimeInterval(15 * 60)
    completion(Timeline(entries: [readEntry()], policy: .after(nextRefresh)))
  }

  private func readEntry() -> GoalHabitsEntry {
    // ExtensionStorage.set() JSON-encodes objects and stores them as Data,
    // so read the raw Data and decode rather than using dictionary(forKey:).
    let defaults = UserDefaults(suiteName: appGroup)
    let (goalText, goalDone, habits) = decodeGoalHabits(from: defaults)

    return GoalHabitsEntry(date: Date(), goalText: goalText, goalDone: goalDone, habits: habits)
  }
}

private func decodeGoalHabits(from defaults: UserDefaults?) -> (goalText: String, goalDone: Bool, habits: [GoalHabitsWidgetHabit]) {
  let payload = defaults?.data(forKey: goalHabitsStorageKey).flatMap {
    try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
  } ?? nil

  let goalText = (payload?["goalText"] as? String) ?? ""
  let goalDone = (payload?["goalDone"] as? Bool) ?? false
  let habitsRaw = (payload?["habits"] as? [[String: Any]]) ?? []

  let pending = Set(readPendingToggles(from: defaults))

  let habits: [GoalHabitsWidgetHabit] = habitsRaw.compactMap { item in
    guard let id = item["id"] as? Int, let title = item["title"] as? String else {
      return nil
    }
    var done = (item["done"] as? Bool) ?? false
    if pending.contains(id) {
      done.toggle()
    }
    return GoalHabitsWidgetHabit(id: id, title: title, done: done)
  }

  return (goalText, goalDone, habits)
}

private func decodeAffirmation(from defaults: UserDefaults?) -> (affirmation: String, dayLabel: String) {
  let payload = defaults?.data(forKey: affirmationStorageKey).flatMap {
    try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
  } ?? nil

  let affirmation = (payload?["text"] as? String) ?? "The next right action is enough."
  let dayLabel = (payload?["dayLabel"] as? String) ?? "Today"
  return (affirmation, dayLabel)
}

struct OverviewProvider: TimelineProvider {
  func placeholder(in context: Context) -> OverviewEntry {
    OverviewEntry(
      date: Date(),
      affirmation: "I can make today lighter by choosing the next honest step.",
      dayLabel: "Today",
      goalText: "Write your main task for today",
      goalDone: false,
      habits: [
        GoalHabitsWidgetHabit(id: 1, title: "Morning walk", done: true),
        GoalHabitsWidgetHabit(id: 2, title: "Read 10 pages", done: false),
        GoalHabitsWidgetHabit(id: 3, title: "Drink water", done: false),
      ]
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (OverviewEntry) -> Void) {
    completion(readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<OverviewEntry>) -> Void) {
    let nextRefresh = Date().addingTimeInterval(15 * 60)
    completion(Timeline(entries: [readEntry()], policy: .after(nextRefresh)))
  }

  private func readEntry() -> OverviewEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    let (affirmation, dayLabel) = decodeAffirmation(from: defaults)
    let (goalText, goalDone, habits) = decodeGoalHabits(from: defaults)

    return OverviewEntry(
      date: Date(),
      affirmation: affirmation,
      dayLabel: dayLabel,
      goalText: goalText,
      goalDone: goalDone,
      habits: habits
    )
  }
}

struct GoalHabitsWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var entry: GoalHabitsEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      GoalHabitsCircularView(entry: entry)
    case .accessoryRectangular:
      GoalHabitsRectangularView(entry: entry)
    default:
      GoalHabitsMediumView(entry: entry)
    }
  }
}

// Lock Screen: today's progress ring, counting the main task as one item
// alongside the habits.
struct GoalHabitsCircularView: View {
  var entry: GoalHabitsEntry

  private var total: Int { entry.habits.count + 1 }
  private var done: Int { entry.habits.filter(\.done).count + (entry.goalDone ? 1 : 0) }

  var body: some View {
    Gauge(value: Double(done), in: 0...Double(total)) {
      Image(systemName: "target")
    } currentValueLabel: {
      Text("\(done)/\(total)")
        .font(.system(size: 14, weight: .bold, design: .rounded))
    }
    .gaugeStyle(.accessoryCircularCapacity)
    .containerBackground(for: .widget) {
      AccessoryWidgetBackground()
    }
  }
}

// Lock Screen: the main task, habit count, and the next habit still to do.
struct GoalHabitsRectangularView: View {
  var entry: GoalHabitsEntry

  private var doneCount: Int { entry.habits.filter(\.done).count }
  private var nextHabit: GoalHabitsWidgetHabit? { entry.habits.first { !$0.done } }

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 4) {
        Image(systemName: entry.goalDone ? "checkmark.circle.fill" : "target")
        Text(entry.goalText.isEmpty ? "Set your main task" : entry.goalText)
          .strikethrough(entry.goalDone)
          .lineLimit(1)
      }
      .font(.system(size: 15, weight: .bold, design: .rounded))
      .widgetAccentable()

      if entry.habits.isEmpty {
        Text("No habits today")
          .foregroundStyle(.secondary)
      } else {
        Text("\(doneCount)/\(entry.habits.count) habits done")
          .foregroundStyle(.secondary)
        if let nextHabit {
          Label(nextHabit.title, systemImage: "circle")
            .lineLimit(1)
        } else {
          Label("All habits done", systemImage: "checkmark.circle.fill")
            .lineLimit(1)
        }
      }
    }
    .font(.system(size: 13, weight: .medium, design: .rounded))
    .frame(maxWidth: .infinity, alignment: .leading)
    .containerBackground(for: .widget) {
      Color.clear
    }
  }
}

struct GoalHabitsMediumView: View {
  var entry: GoalHabitsEntry

  private var visibleHabits: [GoalHabitsWidgetHabit] {
    Array(entry.habits.prefix(maxHabitsShown))
  }

  private var remainingCount: Int {
    max(0, entry.habits.count - visibleHabits.count)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      goalRow(goalText: entry.goalText, goalDone: entry.goalDone, titleSize: 18, iconSize: 20)

      if !entry.habits.isEmpty {
        Divider().overlay(Color("goalHabitsMuted").opacity(0.2))

        VStack(alignment: .leading, spacing: 6) {
          ForEach(visibleHabits) { habit in
            habitRow(habit)
          }
          if remainingCount > 0 {
            Text("+\(remainingCount) more")
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(Color("goalHabitsMuted"))
          }
        }
      }

      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(16)
    .containerBackground(for: .widget) {
      Color("goalHabitsSurface")
    }
  }
}

@ViewBuilder
private func goalRow(goalText: String, goalDone: Bool, titleSize: CGFloat, iconSize: CGFloat) -> some View {
  HStack(alignment: .top, spacing: 8) {
    Image(systemName: "target")
      .font(.system(size: iconSize))
      .foregroundStyle(goalDone ? Color("goalHabitsAccent") : Color("goalHabitsMuted"))

    Text(goalText.isEmpty ? "Set your main task" : goalText)
      .font(.system(size: titleSize, weight: .bold, design: .rounded))
      .foregroundStyle(Color("goalHabitsInk"))
      .strikethrough(goalDone, color: Color("goalHabitsMuted"))
      .lineLimit(2)
      .fixedSize(horizontal: false, vertical: true)
  }
}

@ViewBuilder
func habitRow(_ habit: GoalHabitsWidgetHabit) -> some View {
  Button(intent: ToggleHabitDoneIntent(habitId: habit.id)) {
    HStack(spacing: 8) {
      Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 15))
        .foregroundStyle(habit.done ? Color("goalHabitsAccent") : Color("goalHabitsMuted"))

      Text(habit.title)
        .font(.system(size: 14, weight: .medium, design: .rounded))
        .foregroundStyle(Color("goalHabitsInk"))
        .strikethrough(habit.done, color: Color("goalHabitsMuted"))
        .lineLimit(1)

      Spacer(minLength: 0)
    }
    .contentShape(Rectangle())
  }
  .buttonStyle(.plain)
}

struct OverviewWidgetView: View {
  var entry: OverviewEntry

  private var visibleHabits: [GoalHabitsWidgetHabit] {
    Array(entry.habits.prefix(maxHabitsShown))
  }

  private var remainingCount: Int {
    max(0, entry.habits.count - visibleHabits.count)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 6) {
          Image(systemName: "sun.max.fill")
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundStyle(Color("goalHabitsMuted"))
          Text(entry.dayLabel.uppercased())
            .font(.system(size: 14, weight: .heavy, design: .rounded))
            .foregroundStyle(Color("goalHabitsMuted"))
            .lineLimit(1)
        }

        Text(entry.affirmation)
          .font(.system(size: 20, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("goalHabitsInk"))
          .lineLimit(3)
          .minimumScaleFactor(0.7)
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
      }

      Divider().overlay(Color("goalHabitsMuted").opacity(0.2))

      VStack(alignment: .leading, spacing: 10) {
        goalRow(goalText: entry.goalText, goalDone: entry.goalDone, titleSize: 18, iconSize: 20)

        if !entry.habits.isEmpty {
          VStack(alignment: .leading, spacing: 6) {
            ForEach(visibleHabits) { habit in
              habitRow(habit)
            }
            if remainingCount > 0 {
              Text("+\(remainingCount) more")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(Color("goalHabitsMuted"))
            }
          }
        }
      }

      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(18)
    .containerBackground(for: .widget) {
      Color("goalHabitsSurface")
    }
  }
}

// MARK: - Year progress ("1% better every day")

struct YearProgressEntry: TimelineEntry {
  let date: Date
  let year: Int
  let keptDays: Int
  // Share of elapsed days kept per month (0-1); nil for months still ahead.
  let months: [Double?]
  let currentMonth: Int
  let daysLeft: Int

  // Compounding 1% per kept day: 1.01^keptDays.
  var multiplier: Double { pow(1.01, Double(keptDays)) }

  var multiplierLabel: String {
    String(format: multiplier >= 10 ? "×%.1f" : "×%.2f", multiplier)
  }
}

struct YearProgressProvider: TimelineProvider {
  func placeholder(in context: Context) -> YearProgressEntry {
    makeEntry(year: nil, keptDays: 142, months: [0.9, 0.8, 0.7, 0.85, 0.6, 0.75, 0.9, 0.8, 0.5, nil, nil, nil])
  }

  func getSnapshot(in context: Context, completion: @escaping (YearProgressEntry) -> Void) {
    completion(readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<YearProgressEntry>) -> Void) {
    // Days left and the current month are derived from the clock, so refresh
    // right after midnight even if the app hasn't pushed a new snapshot.
    let calendar = Calendar.current
    let midnight = calendar.startOfDay(for: Date()).addingTimeInterval(24 * 60 * 60)
    let nextRefresh = min(midnight, Date().addingTimeInterval(60 * 60))
    completion(Timeline(entries: [readEntry()], policy: .after(nextRefresh)))
  }

  private func readEntry() -> YearProgressEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    let payload = defaults?.data(forKey: yearProgressStorageKey).flatMap {
      try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
    } ?? nil

    let year = payload?["year"] as? Int
    let keptDays = (payload?["keptDays"] as? Int) ?? 0
    let monthsRaw = (payload?["months"] as? [Double]) ?? []
    let months: [Double?] = (0..<12).map { index in
      guard index < monthsRaw.count, monthsRaw[index] >= 0 else { return nil }
      return monthsRaw[index]
    }
    return makeEntry(year: year, keptDays: keptDays, months: months)
  }

  private func makeEntry(year snapshotYear: Int?, keptDays: Int, months: [Double?]) -> YearProgressEntry {
    let calendar = Calendar.current
    let now = Date()
    let year = calendar.component(.year, from: now)
    let currentMonth = calendar.component(.month, from: now)
    let dayOfYear = calendar.ordinality(of: .day, in: .year, for: now) ?? 1
    let daysInYear = calendar.range(of: .day, in: .year, for: now)?.count ?? 365

    // A snapshot from last year (app not opened since New Year) starts fresh.
    let isStale = snapshotYear != nil && snapshotYear != year
    return YearProgressEntry(
      date: now,
      year: year,
      keptDays: isStale ? 0 : keptDays,
      months: isStale ? Array(repeating: nil, count: 12) : months,
      currentMonth: currentMonth,
      daysLeft: daysInYear - dayOfYear
    )
  }
}

struct YearProgressWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var entry: YearProgressEntry

  var body: some View {
    switch family {
    case .accessoryRectangular:
      YearProgressRectangularView(entry: entry)
    default:
      YearProgressMediumView(entry: entry)
    }
  }
}

struct YearProgressMediumView: View {
  var entry: YearProgressEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(String(entry.year))
          .font(.system(size: 22, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("goalHabitsInk"))
        Spacer(minLength: 0)
        Text(entry.multiplierLabel)
          .font(.system(size: 22, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("goalHabitsAccent"))
          .contentTransition(.numericText())
      }

      HStack(spacing: 5) {
        ForEach(0..<12, id: \.self) { index in
          VStack(spacing: 4) {
            monthPill(index: index)
            Text("\(index + 1)")
              .font(.system(size: 10, weight: index + 1 == entry.currentMonth ? .heavy : .medium, design: .rounded))
              .foregroundStyle(index + 1 == entry.currentMonth ? Color("goalHabitsInk") : Color("goalHabitsMuted"))
          }
        }
      }

      HStack {
        Text("\(entry.keptDays) days 1% better")
        Spacer(minLength: 0)
        Text("\(entry.daysLeft) days left")
      }
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .foregroundStyle(Color("goalHabitsMuted"))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(16)
    .containerBackground(for: .widget) {
      Color("goalHabitsSurface")
    }
  }

  @ViewBuilder
  private func monthPill(index: Int) -> some View {
    let isCurrent = index + 1 == entry.currentMonth
    let fill: Color = {
      guard let ratio = entry.months[index] else {
        return Color("goalHabitsMuted").opacity(0.15)
      }
      return Color("goalHabitsAccent").opacity(0.2 + 0.8 * ratio)
    }()

    Capsule()
      .fill(fill)
      .overlay(
        Capsule().strokeBorder(Color("goalHabitsInk"), lineWidth: isCurrent ? 1.5 : 0)
      )
      .frame(maxWidth: .infinity)
      .frame(height: 34)
  }
}

// Lock Screen: the compounding multiplier plus a 12-month strip.
struct YearProgressRectangularView: View {
  var entry: YearProgressEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline) {
        Text(entry.multiplierLabel)
          .font(.system(size: 17, weight: .heavy, design: .rounded))
          .widgetAccentable()
        Spacer(minLength: 0)
        Text("\(entry.daysLeft)d left")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(.secondary)
      }

      HStack(spacing: 2) {
        ForEach(0..<12, id: \.self) { index in
          Capsule()
            .fill(Color.primary.opacity(entry.months[index].map { 0.25 + 0.75 * $0 } ?? 0.12))
            .frame(maxWidth: .infinity)
            .frame(height: index + 1 == entry.currentMonth ? 14 : 10)
        }
      }

      Text("\(entry.keptDays) days 1% better")
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .containerBackground(for: .widget) {
      Color.clear
    }
  }
}

@main
struct GoalHabitsWidgetBundle: WidgetBundle {
  var body: some Widget {
    GoalHabitsWidget()
    OverviewWidget()
    YearProgressWidget()
    WeekStripWidget()
    MonthGridWidget()
    TodayTimelineWidget()
  }
}

struct GoalHabitsWidget: Widget {
  let kind = "GoalHabitsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: GoalHabitsProvider()) { entry in
      GoalHabitsWidgetView(entry: entry)
    }
    .configurationDisplayName("Today's Focus")
    .description("Your main task and habit checklist for today.")
    .supportedFamilies([.systemMedium, .accessoryCircular, .accessoryRectangular])
    .contentMarginsDisabled()
  }
}

struct OverviewWidget: Widget {
  let kind = "OverviewWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: OverviewProvider()) { entry in
      OverviewWidgetView(entry: entry)
    }
    .configurationDisplayName("1Per Overview")
    .description("Your daily affirmation, main task, and habit checklist together.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}

struct YearProgressWidget: Widget {
  let kind = "YearProgressWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: YearProgressProvider()) { entry in
      YearProgressWidgetView(entry: entry)
    }
    .configurationDisplayName("1% Every Day")
    .description("How much better you've compounded this year, month by month.")
    .supportedFamilies([.systemMedium, .accessoryRectangular])
    .contentMarginsDisabled()
  }
}
