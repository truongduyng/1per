import { useTheme } from "@/hooks/useTheme";
import { getLocalDateString } from "@/lib/timezone";
import React, { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const CELL = 10;
const GAP = 3;

interface Props {
  habitId: number;
  daysOfWeek: string[]; // ['mon','tue',...]
  completions: { habitId: number; date: string; status: string }[];
  today: Date;
  createdAt: Date;
  bestStreak: number;
  totalDone: number;
}

const DOW_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export function HabitHeatmap({ habitId, daysOfWeek, completions, today, createdAt, bestStreak, totalDone }: Props) {
  const C = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidthRef = useRef(0);

  const { grid, completionRate, todayWeekIndex } = useMemo(() => {
    const scheduledDowSet = new Set(daysOfWeek.map((d) => DOW_MAP[d] ?? -1));
    const doneSet = new Set(
      completions
        .filter((c) => c.habitId === habitId && c.status === "done")
        .map((c) => c.date),
    );
    const skippedSet = new Set(
      completions
        .filter((c) => c.habitId === habitId && c.status === "skipped")
        .map((c) => c.date),
    );

    // grid spans from the habit's creation date through the end of this year
    const firstDate = new Date(createdAt);
    firstDate.setDate(firstDate.getDate() - firstDate.getDay());

    const lastDate = new Date(today.getFullYear(), 11, 31);
    lastDate.setDate(lastDate.getDate() + (6 - lastDate.getDay()));

    const daysSpan = Math.floor((lastDate.getTime() - firstDate.getTime()) / 86400000) + 1;
    const weekCount = Math.max(1, Math.ceil(daysSpan / 7));

    const columns: { date: string; dow: number; status: "done" | "skipped" | "missed" | "future" | "not_scheduled" | "before_start" }[][] = [];
    let scheduledCount = 0;
    let doneCount = 0;
    let todayWeekIndex = 0;
    const todayStr = getLocalDateString(today);
    const createdAtStr = getLocalDateString(createdAt);

    for (let week = 0; week < weekCount; week++) {
      const col: typeof columns[number] = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = new Date(firstDate);
        d.setDate(d.getDate() + week * 7 + dow);
        const dateStr = getLocalDateString(d);
        const isFuture = dateStr > todayStr;
        if (dateStr === todayStr) {
          todayWeekIndex = week;
        }
        const isBeforeStart = dateStr < createdAtStr;
        const isScheduled = scheduledDowSet.has(d.getDay());

        let status: typeof col[number]["status"];
        if (isFuture) {
          status = "future";
        } else if (isBeforeStart) {
          status = "before_start";
        } else if (!isScheduled) {
          status = "not_scheduled";
        } else if (doneSet.has(dateStr)) {
          status = "done";
          scheduledCount++;
          doneCount++;
        } else if (skippedSet.has(dateStr)) {
          status = "skipped";
          scheduledCount++;
        } else {
          status = "missed";
          scheduledCount++;
        }

        col.push({ date: dateStr, dow: d.getDay(), status });
      }
      columns.push(col);
    }

    const rate = scheduledCount > 0 ? Math.round((doneCount / scheduledCount) * 100) : 0;
    return { grid: columns, completionRate: rate, todayWeekIndex };
  }, [habitId, daysOfWeek, completions, today, createdAt]);

  const s = makeStyles(C);
  const todayStr = getLocalDateString(today);

  const cellColor = (status: string) => {
    if (status === "done") return C.accent;
    if (status === "skipped") return C.accentBorder;
    if (status === "before_start") return "transparent"; // no cell before the habit existed
    return C.heatIdle; // missed, not_scheduled, or future
  };

  return (
    <View style={s.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.heatmap}
        onLayout={(e) => {
          viewportWidthRef.current = e.nativeEvent.layout.width;
        }}
        onContentSizeChange={() =>
          scrollRef.current?.scrollTo({
            x: Math.max(
              0,
              todayWeekIndex * (CELL + GAP) - viewportWidthRef.current + CELL + 60,
            ),
            animated: false,
          })
        }
      >
        {grid.map((col, wi) => (
          <View key={wi} style={[s.col, wi > 0 && { marginLeft: GAP }]}>
            {col.map((cell, di) => {
              const isToday = cell.date === todayStr;
              const isBeforeStart = cell.status === "before_start";
              return (
                <View
                  key={di}
                  style={[
                    s.cell,
                    {
                      width: CELL,
                      height: CELL,
                      marginTop: di > 0 ? GAP : 0,
                      backgroundColor: cellColor(cell.status),
                      borderColor: isBeforeStart
                        ? "transparent"
                        : isToday
                          ? C.accentText
                          : C.heatIdleBorder,
                      borderWidth: isBeforeStart ? 0 : isToday ? 1.5 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={s.statsRow}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{completionRate}%</Text>
          <Text style={s.statLabel}>Completion</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{bestStreak}</Text>
          <Text style={s.statLabel}>Best streak</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalDone}</Text>
          <Text style={s.statLabel}>Total done</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    wrap: { marginTop: 14, gap: 10 },
    heatmap: {
      flexDirection: "row",
    },
    col: { flexDirection: "column" },
    cell: {
      borderRadius: 2,
      borderWidth: 1,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: C.cardBorder,
    },
    statItem: { alignItems: "center", flex: 1 },
    statValue: {
      fontSize: 15,
      fontWeight: "700",
      color: C.accentText,
    },
    statLabel: {
      fontSize: 10,
      color: C.textTertiary,
      marginTop: 2,
    },
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: C.cardBorder,
    },
  });
}
