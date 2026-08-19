import SwiftUI
import WidgetKit

private let appGroup = "group.app.kadoze.yikudo"
private let storageKey = "goalHabitsSnapshot"
private let maxHabitsShown = 4

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

    return GoalHabitsEntry(date: Date(), goalText: goalText, goalDone: goalDone, habits: habits)
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
      HStack(spacing: 6) {
        Image(systemName: "target")
          .font(.system(size: 13, weight: .bold, design: .rounded))
          .foregroundStyle(Color("goalHabitsAccent"))
        Text("TODAY'S FOCUS")
          .font(.system(size: 12, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("goalHabitsMuted"))
          .lineLimit(1)
        Spacer()
      }

      goalRow

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

  private var goalRow: some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: entry.goalDone ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 18))
        .foregroundStyle(entry.goalDone ? Color("goalHabitsAccent") : Color("goalHabitsMuted"))

      Text(entry.goalText.isEmpty ? "Set your main task" : entry.goalText)
        .font(.system(size: 16, weight: .bold, design: .rounded))
        .foregroundStyle(Color("goalHabitsInk"))
        .strikethrough(entry.goalDone, color: Color("goalHabitsMuted"))
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

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
}

@main
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
