import SwiftUI
import WidgetKit

private let historyStorageKey = "historySnapshot"

// MARK: - Data

enum HistoryItemStatus {
  case done, skipped, todo
}

struct HistoryItem {
  let title: String
  let isGoal: Bool
  let status: HistoryItemStatus
}

struct HistoryDay {
  let date: Date
  let goal: String
  let goalDone: Bool
  let habits: [(title: String, status: HistoryItemStatus)]

  // The main task first, then habits - the order chips are shown in.
  var items: [HistoryItem] {
    var items: [HistoryItem] = []
    if !goal.isEmpty {
      items.append(HistoryItem(title: goal, isGoal: true, status: goalDone ? .done : .todo))
    }
    items += habits.map { HistoryItem(title: $0.title, isGoal: false, status: $0.status) }
    return items
  }

  static func empty(_ date: Date) -> HistoryDay {
    HistoryDay(date: date, goal: "", goalDone: false, habits: [])
  }
}

struct HistoryEntry: TimelineEntry {
  let date: Date
  let daysByKey: [String: HistoryDay]

  // Days are looked up by the device's calendar so the week starts on the
  // user's first weekday; the app sends enough days around today for this.
  func days(weekOffset: Int, weekCount: Int) -> [HistoryDay] {
    let calendar = Calendar.current
    let weekStart = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    guard let firstDay = calendar.date(byAdding: .day, value: weekOffset * 7, to: weekStart) else { return [] }

    return (0..<(weekCount * 7)).compactMap { offset in
      guard let day = calendar.date(byAdding: .day, value: offset, to: firstDay) else { return nil }
      return daysByKey[historyDateFormatter.string(from: day)] ?? .empty(day)
    }
  }
}

private let historyDateFormatter: DateFormatter = {
  let formatter = DateFormatter()
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.timeZone = .current
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter
}()

struct HistoryProvider: TimelineProvider {
  func placeholder(in context: Context) -> HistoryEntry {
    let calendar = Calendar.current
    var days: [String: HistoryDay] = [:]
    for offset in -13...27 {
      guard let day = calendar.date(byAdding: .day, value: offset, to: Date()) else { continue }
      let isPast = offset < 0
      days[historyDateFormatter.string(from: day)] = HistoryDay(
        date: day,
        goal: offset <= 0 ? "Ship the draft" : "",
        goalDone: isPast,
        habits: [
          ("Morning walk", isPast ? .done : .todo),
          ("Read 10 pages", isPast && offset % 3 != 0 ? .done : .todo),
        ]
      )
    }
    return HistoryEntry(date: Date(), daysByKey: days)
  }

  func getSnapshot(in context: Context, completion: @escaping (HistoryEntry) -> Void) {
    completion(readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HistoryEntry>) -> Void) {
    // "Today" moves at midnight even when the app hasn't pushed a snapshot.
    let midnight = Calendar.current.startOfDay(for: Date()).addingTimeInterval(24 * 60 * 60)
    let nextRefresh = min(midnight, Date().addingTimeInterval(60 * 60))
    completion(Timeline(entries: [readEntry()], policy: .after(nextRefresh)))
  }

  private func readEntry() -> HistoryEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    let payload = defaults?.data(forKey: historyStorageKey).flatMap {
      try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
    } ?? nil
    let daysRaw = (payload?["days"] as? [[String: Any]]) ?? []

    var days: [String: HistoryDay] = [:]
    for item in daysRaw {
      guard let key = item["date"] as? String, let date = historyDateFormatter.date(from: key) else { continue }
      let habitsRaw = (item["habits"] as? [[String: Any]]) ?? []
      days[key] = HistoryDay(
        date: date,
        goal: (item["goal"] as? String) ?? "",
        goalDone: (item["goalDone"] as? Bool) ?? false,
        habits: habitsRaw.compactMap { habit in
          guard let title = habit["title"] as? String else { return nil }
          let status: HistoryItemStatus
          switch habit["status"] as? String {
          case "done": status = .done
          case "skipped": status = .skipped
          default: status = .todo
          }
          return (title, status)
        }
      )
    }
    return HistoryEntry(date: Date(), daysByKey: days)
  }
}

// MARK: - Shared views

struct DayChip: View {
  let item: HistoryItem
  let isPast: Bool
  let fontSize: CGFloat
  let height: CGFloat

  private var icon: String? {
    switch item.status {
    case .done: return "checkmark.circle.fill"
    case .skipped: return "minus.circle.fill"
    // Missed days stay quiet; today and upcoming show an open circle.
    case .todo: return isPast ? nil : "circle"
    }
  }

  private var isSettled: Bool { item.status != .todo || isPast }

  var body: some View {
    HStack(spacing: 2) {
      if item.isGoal && item.status == .todo {
        RoundedRectangle(cornerRadius: 1)
          .fill(Color("goalHabitsAccent"))
          .frame(width: 2)
          .padding(.vertical, 2)
      }
      if let icon {
        Image(systemName: icon)
          .font(.system(size: fontSize - 1, weight: .bold))
          .foregroundStyle(item.status == .todo ? Color("goalHabitsAccent") : Color("goalHabitsMuted"))
      }
      Text(item.title)
        .font(.system(size: fontSize, weight: .semibold, design: .rounded))
        .foregroundStyle(isSettled ? Color("goalHabitsMuted") : Color("goalHabitsInk"))
        .lineLimit(1)
        .truncationMode(.tail)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 3)
    .frame(height: height)
    .frame(maxWidth: .infinity)
    .background(
      RoundedRectangle(cornerRadius: 4)
        .fill(item.isGoal ? Color("goalHabitsAccent").opacity(0.22) : Color("goalHabitsMuted").opacity(0.16))
    )
    .opacity(item.status == .todo && isPast ? 0.55 : 1)
  }
}

@ViewBuilder
func dayNumber(_ date: Date, isToday: Bool, isDimmed: Bool, size: CGFloat) -> some View {
  Text("\(Calendar.current.component(.day, from: date))")
    .font(.system(size: size, weight: .bold, design: .rounded))
    .monospacedDigit()
    .foregroundStyle(
      isToday ? Color("goalHabitsSurface") : (isDimmed ? Color("goalHabitsMuted") : Color("goalHabitsInk"))
    )
    .frame(width: size * 1.75, height: size * 1.75)
    .background(Circle().fill(isToday ? Color("goalHabitsInk") : .clear))
}

private func overflowLabel(_ count: Int, size: CGFloat) -> some View {
  Text(count > 0 ? "+\(count)" : " ")
    .font(.system(size: size, weight: .semibold, design: .rounded))
    .foregroundStyle(Color("goalHabitsMuted"))
    .frame(maxWidth: .infinity, alignment: .trailing)
}

// MARK: - Week strip (systemMedium)

private let weekChipsShown = 3

struct WeekStripView: View {
  var entry: HistoryEntry

  var body: some View {
    let calendar = Calendar.current
    let days = entry.days(weekOffset: 0, weekCount: 1)
    let symbols = calendar.shortStandaloneWeekdaySymbols

    HStack(alignment: .top, spacing: 3) {
      ForEach(days, id: \.date) { day in
        let isToday = calendar.isDate(day.date, inSameDayAs: entry.date)
        let isPast = !isToday && day.date < entry.date
        let items = day.items

        VStack(spacing: 3) {
          Text(symbols[calendar.component(.weekday, from: day.date) - 1].uppercased())
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundStyle(Color("goalHabitsMuted"))
          dayNumber(day.date, isToday: isToday, isDimmed: false, size: 15)

          VStack(spacing: 3) {
            ForEach(Array(items.prefix(weekChipsShown).enumerated()), id: \.offset) { _, item in
              DayChip(item: item, isPast: isPast, fontSize: 10, height: 17)
            }
          }
          overflowLabel(items.count - weekChipsShown, size: 9)
          Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .containerBackground(for: .widget) {
      Color("goalHabitsSurface")
    }
  }
}

// MARK: - Month grid (systemLarge)

private let monthChipsShown = 2

struct MonthGridView: View {
  var entry: HistoryEntry

  // One week before the current one plus three after, so today sits on the
  // second row with most of the grid looking ahead.
  private var days: [HistoryDay] { entry.days(weekOffset: -1, weekCount: 5) }

  private var todayCounts: (done: Int, total: Int) {
    let calendar = Calendar.current
    let items = days.first { calendar.isDate($0.date, inSameDayAs: entry.date) }?.items ?? []
    return (items.filter { $0.status == .done }.count, items.count)
  }

  var body: some View {
    let calendar = Calendar.current
    let days = self.days
    let symbols = calendar.veryShortStandaloneWeekdaySymbols
    let currentMonth = calendar.component(.month, from: entry.date)

    VStack(alignment: .leading, spacing: 6) {
      HStack {
        if let first = days.first?.date, let last = days.last?.date {
          Text("\(first.formatted(.dateTime.month(.abbreviated).day())) – \(last.formatted(.dateTime.month(.abbreviated).day()))")
            .font(.system(size: 16, weight: .heavy, design: .rounded))
            .foregroundStyle(Color("goalHabitsInk"))
        }
        Spacer(minLength: 0)
        Text("\(todayCounts.done)/\(todayCounts.total)")
          .font(.system(size: 12, weight: .heavy, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Color("goalHabitsSurface"))
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(Capsule().fill(Color("goalHabitsInk")))
      }

      HStack(spacing: 3) {
        ForEach(days.prefix(7), id: \.date) { day in
          Text(symbols[calendar.component(.weekday, from: day.date) - 1])
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundStyle(Color("goalHabitsMuted"))
            .frame(maxWidth: .infinity)
        }
      }

      VStack(spacing: 4) {
        ForEach(0..<5, id: \.self) { row in
          HStack(alignment: .top, spacing: 3) {
            ForEach(days[(row * 7)..<(row * 7 + 7)], id: \.date) { day in
              monthCell(
                day,
                isToday: calendar.isDate(day.date, inSameDayAs: entry.date),
                isDimmed: calendar.component(.month, from: day.date) != currentMonth
              )
            }
          }
          .frame(maxHeight: .infinity, alignment: .top)
        }
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .containerBackground(for: .widget) {
      Color("goalHabitsSurface")
    }
  }

  private func monthCell(_ day: HistoryDay, isToday: Bool, isDimmed: Bool) -> some View {
    let isPast = !isToday && day.date < entry.date
    let items = day.items

    return VStack(spacing: 2) {
      dayNumber(day.date, isToday: isToday, isDimmed: isDimmed, size: 12)
        .overlay(alignment: .trailing) {
          if items.count > monthChipsShown {
            Text("+\(items.count - monthChipsShown)")
              .font(.system(size: 8, weight: .semibold, design: .rounded))
              .foregroundStyle(Color("goalHabitsMuted"))
              .fixedSize()
              .offset(x: 16)
          }
        }
      ForEach(Array(items.prefix(monthChipsShown).enumerated()), id: \.offset) { _, item in
        DayChip(item: item, isPast: isPast, fontSize: 8.5, height: 13)
      }
    }
    .frame(maxWidth: .infinity)
  }
}

// MARK: - Widgets

struct WeekStripWidget: Widget {
  let kind = "WeekStripWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: HistoryProvider()) { entry in
      WeekStripView(entry: entry)
    }
    .configurationDisplayName("This Week")
    .description("Your main task and habits across the week at a glance.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

struct MonthGridWidget: Widget {
  let kind = "MonthGridWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: HistoryProvider()) { entry in
      MonthGridView(entry: entry)
    }
    .configurationDisplayName("5-Week View")
    .description("Last week, this week, and the weeks ahead - every main task and habit.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}
