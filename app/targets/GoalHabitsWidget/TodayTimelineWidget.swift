import SwiftUI
import WidgetKit

// The Evening Reset unlocks at 21:00 in the app; until it's done it sits on
// the timeline as a planned item at that time.
private let eveningResetHour = 21
private let maxTimelineRows = 9

// MARK: - Data

struct TimelineRow: Identifiable {
  enum Kind {
    case goal
    case habit(id: Int)
    case eveningReset
  }

  let id: String
  let kind: Kind
  let title: String
  let done: Bool
  // nil = no time: the open main task (pinned on top) or an open habit
  // (listed below the divider).
  let time: Date?
}

struct TodayTimelineEntry: TimelineEntry {
  let date: Date
  let goalText: String
  let focusMinutes: Int
  let pinned: [TimelineRow]
  let timed: [TimelineRow]
  let open: [TimelineRow]

  var doneCount: Int { (pinned + timed + open).filter { $0.done && !isEveningReset($0) }.count }
  var totalCount: Int { (pinned + timed + open).filter { !isEveningReset($0) }.count }

  private func isEveningReset(_ row: TimelineRow) -> Bool {
    if case .eveningReset = row.kind { return true }
    return false
  }
}

struct TodayTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayTimelineEntry {
    let calendar = Calendar.current
    let today = calendar.startOfDay(for: Date())
    func at(_ hour: Int, _ minute: Int) -> Date {
      calendar.date(bySettingHour: hour, minute: minute, second: 0, of: today) ?? today
    }
    return makeEntry(
      goalText: "Ship the draft",
      goalDoneAt: nil,
      focusMinutes: 50,
      eveningResetDoneAt: nil,
      habits: [
        (1, "Morning walk", true, at(7, 10)),
        (2, "Drink water", true, at(9, 30)),
        (3, "Read 10 pages", false, nil),
      ]
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayTimelineEntry) -> Void) {
    completion(readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayTimelineEntry>) -> Void) {
    let nextRefresh = Date().addingTimeInterval(15 * 60)
    completion(Timeline(entries: [readEntry()], policy: .after(nextRefresh)))
  }

  private func readEntry() -> TodayTimelineEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    let payload = defaults?.data(forKey: goalHabitsStorageKey).flatMap {
      try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
    } ?? nil

    let pending = Set(readPendingToggles(from: defaults))
    let habitsRaw = (payload?["habits"] as? [[String: Any]]) ?? []
    let habits: [(Int, String, Bool, Date?)] = habitsRaw.compactMap { item in
      guard let id = item["id"] as? Int, let title = item["title"] as? String else { return nil }
      var done = (item["done"] as? Bool) ?? false
      var doneAt = date(fromMillis: item["doneAt"])
      if pending.contains(id) {
        done.toggle()
        // Just tapped in the widget: it was done about now.
        doneAt = done ? Date() : nil
      }
      return (id, title, done, done ? doneAt : nil)
    }

    return makeEntry(
      goalText: (payload?["goalText"] as? String) ?? "",
      goalDoneAt: (payload?["goalDone"] as? Bool) == true ? (date(fromMillis: payload?["goalDoneAt"]) ?? Date()) : nil,
      focusMinutes: (payload?["focusMinutes"] as? Int) ?? 0,
      eveningResetDoneAt: date(fromMillis: payload?["eveningResetDoneAt"]),
      habits: habits
    )
  }

  private func date(fromMillis value: Any?) -> Date? {
    guard let millis = value as? Double else { return nil }
    return Date(timeIntervalSince1970: millis / 1000)
  }

  private func makeEntry(
    goalText: String,
    goalDoneAt: Date?,
    focusMinutes: Int,
    eveningResetDoneAt: Date?,
    habits: [(id: Int, title: String, done: Bool, doneAt: Date?)]
  ) -> TodayTimelineEntry {
    let calendar = Calendar.current
    var pinned: [TimelineRow] = []
    var timed: [TimelineRow] = []
    var open: [TimelineRow] = []

    let goalRow = TimelineRow(
      id: "goal",
      kind: .goal,
      title: goalText.isEmpty ? "Set your main task" : goalText,
      done: goalDoneAt != nil,
      time: goalDoneAt
    )
    if goalDoneAt != nil { timed.append(goalRow) } else { pinned.append(goalRow) }

    for habit in habits {
      let row = TimelineRow(
        id: "habit-\(habit.id)",
        kind: .habit(id: habit.id),
        title: habit.title,
        done: habit.done,
        time: habit.doneAt
      )
      if habit.done { timed.append(row) } else { open.append(row) }
    }

    let resetTime = eveningResetDoneAt
      ?? calendar.date(bySettingHour: eveningResetHour, minute: 0, second: 0, of: Date())
    timed.append(TimelineRow(
      id: "evening-reset",
      kind: .eveningReset,
      title: "Evening Reset",
      done: eveningResetDoneAt != nil,
      time: resetTime
    ))
    timed.sort { ($0.time ?? .distantFuture) < ($1.time ?? .distantFuture) }

    return TodayTimelineEntry(
      date: Date(),
      goalText: goalText,
      focusMinutes: focusMinutes,
      pinned: pinned,
      timed: timed,
      open: open
    )
  }
}

// MARK: - View

struct TodayTimelineView: View {
  var entry: TodayTimelineEntry

  // Keep the open habits (the tappable part) visible: trim done rows first.
  private var visible: (pinned: [TimelineRow], timed: [TimelineRow], open: [TimelineRow], hidden: Int) {
    let openShown = Array(entry.open.prefix(max(0, maxTimelineRows - entry.pinned.count - 1)))
    let timedRoom = max(0, maxTimelineRows - entry.pinned.count - openShown.count)
    // Drop the earliest done rows; the upcoming Evening Reset stays.
    let timedShown = Array(entry.timed.suffix(timedRoom))
    let hidden = entry.timed.count - timedShown.count + entry.open.count - openShown.count
    return (entry.pinned, timedShown, openShown, hidden)
  }

  var body: some View {
    let visible = self.visible

    VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline) {
        Text(entry.date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))
          .font(.system(size: 17, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("goalHabitsInk"))
        Spacer(minLength: 0)
        Text("\(entry.doneCount)/\(entry.totalCount)")
          .font(.system(size: 12, weight: .heavy, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Color("goalHabitsSurface"))
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(Capsule().fill(Color("goalHabitsInk")))
      }

      if entry.focusMinutes > 0 {
        Label("\(entry.focusMinutes) min focused", systemImage: "timer")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(Color("goalHabitsAccent"))
      }

      ForEach(visible.pinned) { row in
        timelineRow(row, timeLabel: Text("today"))
      }
      ForEach(visible.timed) { row in
        timelineRow(row, timeLabel: row.time.map { Text($0, format: .dateTime.hour().minute()) } ?? Text(""))
      }

      if !visible.open.isEmpty {
        Divider().overlay(Color("goalHabitsMuted").opacity(0.2))
        ForEach(visible.open) { row in
          timelineRow(row, timeLabel: Text(""))
        }
      }

      if visible.hidden > 0 {
        Text("+\(visible.hidden) more")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(Color("goalHabitsMuted"))
          .padding(.leading, 50)
      }

      Spacer(minLength: 0)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .containerBackground(for: .widget) {
      Color("goalHabitsSurface")
    }
  }

  @ViewBuilder
  private func timelineRow(_ row: TimelineRow, timeLabel: Text) -> some View {
    let content = HStack(spacing: 8) {
      timeLabel
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .monospacedDigit()
        .foregroundStyle(Color("goalHabitsMuted"))
        .lineLimit(1)
        .frame(width: 42, alignment: .trailing)

      Image(systemName: icon(for: row))
        .font(.system(size: 15))
        .foregroundStyle(row.done ? Color("goalHabitsAccent") : Color("goalHabitsMuted"))
        .frame(width: 18)

      Text(row.title)
        .font(.system(size: 15, weight: isGoal(row) ? .bold : .medium, design: .rounded))
        .foregroundStyle(row.done ? Color("goalHabitsMuted") : Color("goalHabitsInk"))
        .strikethrough(row.done && !isGoal(row), color: Color("goalHabitsMuted"))
        .lineLimit(1)

      Spacer(minLength: 0)
    }
    .contentShape(Rectangle())

    if case .habit(let id) = row.kind {
      Button(intent: ToggleHabitDoneIntent(habitId: id)) { content }
        .buttonStyle(.plain)
    } else {
      content
    }
  }

  private func isGoal(_ row: TimelineRow) -> Bool {
    if case .goal = row.kind { return true }
    return false
  }

  private func icon(for row: TimelineRow) -> String {
    switch row.kind {
    case .goal: return row.done ? "checkmark.circle.fill" : "target"
    case .habit: return row.done ? "checkmark.circle.fill" : "circle"
    case .eveningReset: return row.done ? "moon.fill" : "moon"
    }
  }
}

struct TodayTimelineWidget: Widget {
  let kind = "TodayTimelineWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: TodayTimelineProvider()) { entry in
      TodayTimelineView(entry: entry)
    }
    .configurationDisplayName("Today's Timeline")
    .description("What you've done today, in order - and what's still open.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}
