import SwiftUI
import WidgetKit

private let appGroup = "group.app.kadoze.yikudo"
private let storageKey = "goalHabitsSnapshot"
private let affirmationStorageKey = "dailyAffirmation"
private let maxHabitsShown = 3

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
  let payload = defaults?.data(forKey: storageKey).flatMap {
    try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
  } ?? nil

  let goalText = (payload?["goalText"] as? String) ?? ""
  let goalDone = (payload?["goalDone"] as? Bool) ?? false
  let habitsRaw = (payload?["habits"] as? [[String: Any]]) ?? []

  let habits: [GoalHabitsWidgetHabit] = habitsRaw.compactMap { item in
    guard let id = item["id"] as? Int, let title = item["title"] as? String else {
      return nil
    }
    let done = (item["done"] as? Bool) ?? false
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
private func habitRow(_ habit: GoalHabitsWidgetHabit) -> some View {
  HStack(spacing: 8) {
    Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
      .font(.system(size: 15))
      .foregroundStyle(habit.done ? Color("goalHabitsAccent") : Color("goalHabitsMuted"))

    Text(habit.title)
      .font(.system(size: 14, weight: .medium, design: .rounded))
      .foregroundStyle(Color("goalHabitsInk"))
      .strikethrough(habit.done, color: Color("goalHabitsMuted"))
      .lineLimit(1)
  }
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

@main
struct GoalHabitsWidgetBundle: WidgetBundle {
  var body: some Widget {
    GoalHabitsWidget()
    OverviewWidget()
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
    .supportedFamilies([.systemMedium])
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
