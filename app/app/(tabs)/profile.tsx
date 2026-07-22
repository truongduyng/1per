import React, { useCallback, useMemo, useRef } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import ViewShot, { captureRef, type ViewShotRef } from "react-native-view-shot";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import GradientBackground from "@/components/GradientBackground";
import {
  db,
  dailyFocus,
  habitCompletions,
  habits,
  profiles,
} from "@/lib/db";
import { DAY_NAMES } from "@/lib/performance";
import { getTodayInLocalTimezone } from "@/lib/timezone";
import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { resolveIoniconName } from "@/lib/iconNames";
import { getGameAvatar } from "@/lib/avatarCatalog";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const CONSISTENCY_CELL = 10;
const CONSISTENCY_GAP = 3;
const TREND_DAYS = 14;

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getIdentityTitle(score: number) {
  if (score >= 85) return "Unshakeable";
  if (score >= 70) return "Dialed In";
  if (score >= 55) return "Building Heat";
  if (score >= 35) return "Finding Rhythm";
  return "Getting Started";
}

function buildLinePath(
  values: number[],
  width: number,
  height: number,
  padding = 8,
) {
  if (values.length === 0) {
    return { path: "", points: [] as { x: number; y: number }[] };
  }

  const maxValue = Math.max(...values, 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : padding + (index / (values.length - 1)) * innerWidth;
    const y = padding + innerHeight - (value / maxValue) * innerHeight;
    return { x, y };
  });

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");

  return { path, points };
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const shareCardRef = useRef<ViewShotRef>(null);
  const today = useMemo(() => getTodayInLocalTimezone(), []);

  const { data: profileData } = useLiveQuery(
    db.select().from(profiles).limit(1),
  );
  const { data: allCompletions } = useLiveQuery(
    db.select().from(habitCompletions),
  );
  const { data: allHabits } = useLiveQuery(db.select().from(habits));
  const { data: allFocusRows } = useLiveQuery(db.select().from(dailyFocus));

  const profile = profileData?.[0];
  const displayName = profile?.name?.trim() || "User";
  const savedAvatar = profile?.avatar?.trim();
  const gameAvatar = getGameAvatar(savedAvatar);

  const analytics = useMemo(() => {
    const completions = allCompletions ?? [];
    const habitsData = allHabits ?? [];
    const focusData = allFocusRows ?? [];

    const doneCompletions = completions.filter(
      (item) => item.status === "done",
    );
    const trackedCompletions = completions.filter(
      (item) => item.status === "done" || item.status === "skipped",
    );

    const doneByDate = new Map<string, number>();
    const trackedByDate = new Map<string, number>();
    for (const item of doneCompletions) {
      doneByDate.set(item.date, (doneByDate.get(item.date) ?? 0) + 1);
    }
    for (const item of trackedCompletions) {
      trackedByDate.set(item.date, (trackedByDate.get(item.date) ?? 0) + 1);
    }

    let focusDoneCount = 0;
    let focusTrackedCount = 0;
    for (const item of focusData) {
      // Daily focus contributes the locked "Main Goal" and "Evening Reset"
      // routines shown on the Routines tab, so include both in profile-level
      // consistency instead of only counting custom habits.
      const trackedForDate = 2;
      const doneForDate =
        (item.completedAt ? 1 : 0) + (item.eveningResetCompletedAt ? 1 : 0);

      trackedByDate.set(
        item.date,
        (trackedByDate.get(item.date) ?? 0) + trackedForDate,
      );
      if (doneForDate > 0) {
        doneByDate.set(item.date, (doneByDate.get(item.date) ?? 0) + doneForDate);
      }
      focusTrackedCount += trackedForDate;
      focusDoneCount += doneForDate;
    }

    let currentStreak = 0;
    const streakCursor = new Date(today);
    while ((doneByDate.get(formatDateKey(streakCursor)) ?? 0) > 0) {
      currentStreak += 1;
      streakCursor.setDate(streakCursor.getDate() - 1);
    }

    const todayName = DAY_NAMES[today.getDay()];
    const activeToday =
      habitsData.filter((habit) =>
        (habit.daysOfWeek as string[]).includes(todayName),
      ).length + 2;

    const totalTracked = trackedCompletions.length + focusTrackedCount;
    const totalDone = doneCompletions.length + focusDoneCount;
    const completionRate = totalTracked
      ? Math.round((totalDone / totalTracked) * 100)
      : 0;

    const weekActivity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const dateKey = formatDateKey(date);
      return {
        label: WEEKDAY_LABELS[date.getDay()],
        count: doneByDate.get(dateKey) ?? 0,
      };
    });

    const bestDayCount = Math.max(...weekActivity.map((item) => item.count), 1);

    const earliestDates = [
      ...habitsData.map((h) => h.createdAt.getTime()),
      ...focusData.map((item) => item.createdAt.getTime()),
    ];
    const earliestCreatedAt = earliestDates.length
      ? new Date(Math.min(...earliestDates))
      : new Date(today);

    const consistencyFirstDate = new Date(earliestCreatedAt);
    consistencyFirstDate.setDate(
      consistencyFirstDate.getDate() - consistencyFirstDate.getDay(),
    );
    const consistencyLastDate = new Date(today.getFullYear(), 11, 31);
    consistencyLastDate.setDate(
      consistencyLastDate.getDate() + (6 - consistencyLastDate.getDay()),
    );
    const consistencyDaysSpan =
      Math.floor(
        (consistencyLastDate.getTime() - consistencyFirstDate.getTime()) /
          86400000,
      ) + 1;

    const consistencyGrid = Array.from(
      { length: consistencyDaysSpan },
      (_, index) => {
        const date = new Date(consistencyFirstDate);
        date.setDate(consistencyFirstDate.getDate() + index);
        const dateKey = formatDateKey(date);
        const doneCount = doneByDate.get(dateKey) ?? 0;
        const trackedCount = trackedByDate.get(dateKey) ?? 0;
        const intensity =
          trackedCount === 0 ? 0 : clamp(doneCount / trackedCount, 0, 1);

        return {
          dateKey,
          label: WEEKDAY_LABELS[date.getDay()],
          doneCount,
          trackedCount,
          intensity,
        };
      },
    );

    const consistentDays = consistencyGrid.filter(
      (item) => item.doneCount > 0,
    ).length;
    const focusMinutesTotal = focusData.reduce(
      (sum, item) => sum + (item.focusMinutes ?? 0),
      0,
    );
    const focusHours = focusMinutesTotal / 60;
    const focusByDate = new Map(focusData.map((item) => [item.date, item]));
    const focusTrendSeries = Array.from({ length: TREND_DAYS }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (TREND_DAYS - 1 - index));
      const dateKey = formatDateKey(date);
      const focusEntry = focusByDate.get(dateKey);
      const minutes = focusEntry?.focusMinutes ?? 0;

      return {
        dateKey,
        label: WEEKDAY_LABELS[date.getDay()],
        minutes,
      };
    });

    const currentFocusWindow = focusTrendSeries.slice(-7);
    const currentFocusTotal = currentFocusWindow.reduce(
      (sum, item) => sum + item.minutes,
      0,
    );
    const activeFocusDays = focusTrendSeries.filter(
      (item) => item.minutes > 0,
    ).length;
    const averageFocusMinutes = Math.round(
      currentFocusTotal / currentFocusWindow.length,
    );
    const focusPeak = Math.max(
      ...focusTrendSeries.map((item) => item.minutes),
      0,
    );

    const momentumScore = clamp(
      Math.round(
        completionRate * 0.55 +
          Math.min(currentStreak, 14) * 3 +
          consistentDays * 0.35,
      ),
      0,
      100,
    );

    const perHabit = habitsData
      .map((habit) => {
        let streak = 0;
        const cursor = new Date(today);
        while (true) {
          const dateKey = formatDateKey(cursor);
          const match = completions.find(
            (item) =>
              item.habitId === habit.id &&
              item.date === dateKey &&
              item.status === "done",
          );
          if (!match) break;
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
        }

        const tracked = trackedCompletions.filter(
          (item) => item.habitId === habit.id,
        );
        const done = doneCompletions.filter(
          (item) => item.habitId === habit.id,
        );
        const rate = tracked.length
          ? Math.round((done.length / tracked.length) * 100)
          : 0;

        return {
          id: habit.id,
          title: habit.title,
          icon: habit.icon ?? "•",
          streak,
          rate,
          done: done.length,
        };
      })
      .sort((a, b) => {
        if (b.rate !== a.rate) return b.rate - a.rate;
        if (b.streak !== a.streak) return b.streak - a.streak;
        return b.done - a.done;
      });

    const longestHabitStreak = perHabit.length
      ? Math.max(...perHabit.map((item) => item.streak))
      : 0;

    return {
      currentStreak,
      totalDone,
      activeToday,
      completionRate,
      habitsCount: habitsData.length + 2,
      weekActivity,
      bestDayCount,
      consistencyGrid,
      consistentDays,
      focusHours,
      focusTrendSeries,
      activeFocusDays,
      averageFocusMinutes,
      focusPeak,
      momentumScore,
      identityTitle: getIdentityTitle(momentumScore),
      topHabits: perHabit.slice(0, 3),
      longestHabitStreak,
    };
  }, [allCompletions, allFocusRows, allHabits, today]);

  const displayAvatarIcon = resolveIoniconName(savedAvatar, "person-outline");

  const consistencyScrollRef = useRef<ScrollView>(null);
  const consistencyViewportWidthRef = useRef(0);
  const consistencyColumns = useMemo(() => {
    const columns: (typeof analytics.consistencyGrid)[] = [];
    for (let i = 0; i < analytics.consistencyGrid.length; i += 7) {
      columns.push(analytics.consistencyGrid.slice(i, i + 7));
    }
    return columns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics.consistencyGrid]);
  const todayConsistencyWeekIndex = useMemo(() => {
    const todayKey = formatDateKey(today);
    const dayIndex = analytics.consistencyGrid.findIndex(
      (item) => item.dateKey === todayKey,
    );
    return dayIndex >= 0 ? Math.floor(dayIndex / 7) : consistencyColumns.length - 1;
  }, [analytics.consistencyGrid, consistencyColumns.length, today]);

  const scrollConsistencyToToday = useCallback(() => {
    const viewportWidth = consistencyViewportWidthRef.current;
    if (!viewportWidth) return;

    consistencyScrollRef.current?.scrollTo({
      x: Math.max(
        0,
        todayConsistencyWeekIndex * (CONSISTENCY_CELL + CONSISTENCY_GAP) -
          viewportWidth +
          CONSISTENCY_CELL +
          60,
      ),
      animated: false,
    });
  }, [todayConsistencyWeekIndex]);

  const trendChart = useMemo(
    () =>
      buildLinePath(
        analytics.focusTrendSeries.map((item) => item.minutes),
        320,
        140,
        12,
      ),
    [analytics.focusTrendSeries],
  );
  const trendAreaPath = useMemo(() => {
    if (trendChart.points.length === 0) return "";
    const firstPoint = trendChart.points[0];
    const lastPoint = trendChart.points[trendChart.points.length - 1];
    return `${trendChart.path} L ${lastPoint.x.toFixed(2)} 128 L ${firstPoint.x.toFixed(2)} 128 Z`;
  }, [trendChart]);

  const shareMessage = useMemo(
    () =>
      `${displayName}'s Discipline Score is ${analytics.momentumScore}/100 (${analytics.identityTitle}). ${analytics.currentStreak} day streak, ${analytics.completionRate}% completion. Built with 1Per.`,
    [
      analytics.completionRate,
      analytics.currentStreak,
      analytics.identityTitle,
      analytics.momentumScore,
      displayName,
    ],
  );

  const handleShareDisciplineScore = useCallback(async () => {
    try {
      if (!shareCardRef.current) return;

      const canShareFile = await Sharing.isAvailableAsync();
      if (!canShareFile) {
        await Share.share({
          title: "My 1Per Discipline Score",
          message: shareMessage,
        });
        return;
      }

      const uri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Discipline Score",
        UTI: "public.png",
      });
    } catch (error) {
      console.error("Error sharing discipline score:", error);
      Share.share({
        title: "My 1Per Discipline Score",
        message: shareMessage,
      }).catch((shareError) => {
        console.error("Error sharing fallback text:", shareError);
      });
    }
  }, [shareMessage]);

  const s = makeStyles(C);

  return (
    <View style={s.container}>
      <GradientBackground />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 26,
          paddingHorizontal: 20,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.section}>
          <View style={s.identityTop}>
            <View style={s.identityPrimary}>
              <View style={s.avatar}>
                {gameAvatar ? (
                  <Image source={gameAvatar.source} style={s.avatarImage} />
                ) : (
                  <Ionicons
                    name={displayAvatarIcon}
                    size={30}
                    color={palette.orange}
                  />
                )}
              </View>
              <View style={s.identityMeta}>
                <Text selectable style={s.name}>
                  {displayName}
                </Text>
              </View>
            </View>
            <View style={s.headerActions}>
              <Pressable
                style={s.headerActionButton}
                onPress={handleShareDisciplineScore}
                hitSlop={10}
              >
                <Ionicons
                  name="share-social-outline"
                  size={18}
                  color={C.iconSecondary}
                />
              </Pressable>
              <Pressable
                style={s.headerActionButton}
                onPress={() => router.push("/settings")}
                hitSlop={10}
              >
                <Ionicons
                  name="settings-outline"
                  size={18}
                  color={C.iconSecondary}
                />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.shareCard}>
            <View style={s.shareCardHeader}>
              <Text selectable style={s.shareBrandText}>
                Discipline Score
              </Text>
            </View>

            <View style={s.shareScoreBlock}>
              <Text selectable style={s.shareScoreValue}>
                {analytics.momentumScore}
              </Text>
            </View>

            <View style={s.shareTitleRow}>
              <Text selectable style={s.shareTitle} numberOfLines={1}>
                {analytics.identityTitle}
              </Text>
            </View>

            <View style={s.shareStatsRow}>
              <View style={s.shareStatPill}>
                <Text selectable style={s.shareStatValue}>
                  {analytics.currentStreak}d
                </Text>
                <Text selectable style={s.shareStatLabel}>
                  streak
                </Text>
              </View>
              <View style={s.shareStatPill}>
                <Text selectable style={s.shareStatValue}>
                  {analytics.completionRate}%
                </Text>
                <Text selectable style={s.shareStatLabel}>
                  done
                </Text>
              </View>
              <View style={s.shareStatPill}>
                <Text selectable style={s.shareStatValue}>
                  {analytics.consistentDays}
                </Text>
                <Text selectable style={s.shareStatLabel}>
                  active days
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.heroCard}>
            <Text selectable style={s.metricEyebrow}>
              Consistency
            </Text>

            <ScrollView
              ref={consistencyScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.gridWrap}
              onLayout={(event) => {
                consistencyViewportWidthRef.current = event.nativeEvent.layout.width;
                scrollConsistencyToToday();
              }}
              onContentSizeChange={scrollConsistencyToToday}
            >
              {consistencyColumns.map((col, wi) => (
                <View
                  key={wi}
                  style={[s.gridCol, wi > 0 && { marginLeft: CONSISTENCY_GAP }]}
                >
                  {col.map((item, di) => (
                    <View
                      key={item.dateKey}
                      style={[
                        s.gridCell,
                        di > 0 && { marginTop: CONSISTENCY_GAP },
                        item.intensity === 0 && s.gridCellIdle,
                        item.intensity > 0 &&
                          item.intensity < 0.5 &&
                          s.gridCellLow,
                        item.intensity >= 0.5 &&
                          item.intensity < 1 &&
                          s.gridCellMid,
                        item.intensity === 1 && s.gridCellHigh,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={s.section}>
          <View style={[s.analyticsCard, s.trendCard]}>
            <View style={s.trendHeader}>
              <View style={s.trendHeaderCopy}>
                <Text selectable style={s.metricEyebrow}>
                  Focus trend
                </Text>
              </View>
              <Text selectable style={s.trendHeadline}>
                {analytics.focusHours.toFixed(1)}h
              </Text>
            </View>
            <View style={s.trendStatsRow}>
              <View style={s.trendStat}>
                <Text selectable style={s.trendStatValue}>
                  {analytics.activeFocusDays}
                </Text>
                <Text selectable style={s.trendStatLabel}>
                  active days
                </Text>
              </View>
              <View style={s.trendStat}>
                <Text selectable style={s.trendStatValue}>
                  {analytics.averageFocusMinutes}m
                </Text>
                <Text selectable style={s.trendStatLabel}>
                  7-day avg
                </Text>
              </View>
              <View style={s.trendStat}>
                <Text selectable style={s.trendStatValue}>
                  {analytics.focusPeak}m
                </Text>
                <Text selectable style={s.trendStatLabel}>
                  peak day
                </Text>
              </View>
            </View>
            <View style={s.trendChartWrap}>
              <Svg width="100%" height="140" viewBox="0 0 320 140">
                <Defs>
                  <LinearGradient
                    id="focusTrendFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <Stop
                      offset="0%"
                      stopColor={palette.orange}
                      stopOpacity={0.34}
                    />
                    <Stop
                      offset="100%"
                      stopColor={palette.orange}
                      stopOpacity={0.02}
                    />
                  </LinearGradient>
                </Defs>
                <Path
                  d="M 12 128 L 308 128"
                  stroke={C.divider}
                  strokeWidth={1}
                  strokeLinecap="round"
                />
                <Path
                  d="M 12 88 L 308 88"
                  stroke={C.cardBorder}
                  strokeWidth={1}
                  strokeDasharray="3 5"
                  strokeLinecap="round"
                />
                {trendAreaPath ? (
                  <Path d={trendAreaPath} fill="url(#focusTrendFill)" />
                ) : null}
                <Path
                  d={trendChart.path}
                  fill="none"
                  stroke={palette.orange}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {trendChart.points.map((point, index) => (
                  <Circle
                    key={`trend-point-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={index === trendChart.points.length - 1 ? 5 : 3.5}
                    fill={palette.orange}
                    opacity={index === trendChart.points.length - 1 ? 1 : 0.75}
                  />
                ))}
              </Svg>
            </View>
            <View style={s.trendLabelsRow}>
              {analytics.focusTrendSeries.map((item) => (
                <Text key={item.dateKey} selectable style={s.trendLabel}>
                  {item.label}
                </Text>
              ))}
            </View>
          </View>

          <View style={s.activityCard}>
            <View style={s.activityHeader}>
              <View>
                <Text selectable style={s.metricEyebrow}>
                  Weekly rhythm
                </Text>
              </View>
            </View>

            <View style={s.chartRow}>
              {analytics.weekActivity.map((item, index) => (
                <View key={`${index}-${item.label}`} style={s.chartColumn}>
                  <Text selectable style={s.chartCount}>
                    {item.count}
                  </Text>
                  <View style={s.chartTrack}>
                    <View
                      style={[
                        s.chartFill,
                        {
                          height: `${Math.max(
                            12,
                            (item.count / analytics.bestDayCount) * 100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text selectable style={s.chartLabel}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.analyticsRow}>
            <View style={s.analyticsCard}>
              <Text selectable style={s.metricEyebrow}>
                Completion
              </Text>
              <Text selectable style={s.analyticsValueSmall}>
                {analytics.completionRate}%
              </Text>
            </View>
            <View style={s.analyticsCard}>
              <Text selectable style={s.metricEyebrow}>
                Best streak
              </Text>
              <Text selectable style={s.analyticsValueSmall}>
                {analytics.longestHabitStreak}d
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <ViewShot
        ref={shareCardRef}
        options={{ format: "png", quality: 1, result: "tmpfile" }}
        style={s.hiddenShareCapture}
      >
        <View style={s.shareImageWrap}>
          <View style={s.shareCard}>
            <View style={s.shareProfileRow}>
              <View style={s.shareAvatar}>
                {gameAvatar ? (
                  <Image source={gameAvatar.source} style={s.shareAvatarImage} />
                ) : (
                  <Ionicons
                    name={displayAvatarIcon}
                    size={24}
                    color={palette.orange}
                  />
                )}
              </View>
              <View style={s.shareProfileMeta}>
                <Text selectable style={s.shareName} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
            </View>

            <View style={s.shareScoreBlock}>
              <Text selectable style={s.shareScoreValue}>
                {analytics.momentumScore}
              </Text>
            </View>

            <View style={s.shareTitleRow}>
              <Text selectable style={s.shareTitle} numberOfLines={1}>
                {analytics.identityTitle}
              </Text>
            </View>

            <View style={s.shareStatsRow}>
              <View style={s.shareStatPill}>
                <Text selectable style={s.shareStatValue}>
                  {analytics.currentStreak}d
                </Text>
                <Text selectable style={s.shareStatLabel}>
                  streak
                </Text>
              </View>
              <View style={s.shareStatPill}>
                <Text selectable style={s.shareStatValue}>
                  {analytics.completionRate}%
                </Text>
                <Text selectable style={s.shareStatLabel}>
                  done
                </Text>
              </View>
              <View style={s.shareStatPill}>
                <Text selectable style={s.shareStatValue}>
                  {analytics.consistentDays}
                </Text>
                <Text selectable style={s.shareStatLabel}>
                  active days
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ViewShot>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof import("@/hooks/useTheme").useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: -46,
    },
    headerActionButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    section: { gap: 14 },
    identityTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    },
    identityPrimary: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingRight: 8,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    identityMeta: { flex: 1, gap: 3 },
    name: {
      color: C.textPrimary,
      fontSize: 28,
      fontWeight: "800",
    },
    identitySubtitle: {
      color: C.textTertiary,
      fontSize: 15,
      fontWeight: "700",
    },
    metricEyebrow: {
      color: C.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    hiddenShareCapture: {
      position: "absolute",
      left: -10000,
      top: 0,
      width: 390,
    },
    shareImageWrap: {
      borderRadius: 28,
      borderCurve: "continuous",
      backgroundColor: C.inputBg,
      padding: 14,
      overflow: "hidden",
      width: 390,
    },
    shareCard: {
      borderRadius: 26,
      borderCurve: "continuous",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 20,
      gap: 14,
      overflow: "hidden",
    },
    shareCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    shareBrandText: {
      flex: 1,
      color: C.textTertiary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    shareProfileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    shareAvatar: {
      width: 58,
      height: 58,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    shareAvatarImage: {
      width: "100%",
      height: "100%",
    },
    shareProfileMeta: {
      flex: 1,
      gap: 3,
    },
    shareName: {
      color: C.textPrimary,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: "900",
    },
    shareScoreBlock: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "center",
      paddingTop: 4,
    },
    shareScoreValue: {
      color: C.textPrimary,
      fontSize: 96,
      lineHeight: 100,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    shareTitleRow: {
      alignItems: "center",
      gap: 4,
    },
    shareTitle: {
      color: palette.orange,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: "900",
      textAlign: "center",
    },
    shareStatsRow: {
      flexDirection: "row",
      gap: 8,
      paddingTop: 4,
    },
    shareStatPill: {
      flex: 1,
      borderRadius: 16,
      borderCurve: "continuous",
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      paddingHorizontal: 10,
      paddingVertical: 10,
      gap: 3,
    },
    shareStatValue: {
      color: C.textPrimary,
      fontSize: 17,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
      textAlign: "center",
    },
    shareStatLabel: {
      color: C.textTertiary,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      textAlign: "center",
    },
    heroCard: {
      borderRadius: 28,
      borderCurve: "continuous",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 18,
      gap: 16,
    },
    gridWrap: {
      flexDirection: "row",
    },
    gridCol: {
      flexDirection: "column",
    },
    gridCell: {
      width: CONSISTENCY_CELL,
      height: CONSISTENCY_CELL,
      borderRadius: 2,
      borderWidth: 1,
      borderColor: C.heatIdleBorder,
    },
    gridCellIdle: { backgroundColor: C.heatIdle },
    gridCellLow: { backgroundColor: C.heatLow },
    gridCellMid: { backgroundColor: C.heatMid },
    gridCellHigh: { backgroundColor: C.heatHigh },
    analyticsRow: { flexDirection: "row", gap: 12 },
    analyticsCard: {
      flex: 1,
      minHeight: 130,
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 16,
      gap: 12,
    },
    analyticsValueSmall: {
      color: C.textPrimary,
      fontSize: 30,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    trendCard: {
      minHeight: 0,
      paddingTop: 18,
      paddingBottom: 18,
      gap: 18,
    },
    trendHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    trendHeaderCopy: { flex: 1, gap: 6 },
    trendHeadline: {
      color: C.textPrimary,
      fontSize: 34,
      lineHeight: 38,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    trendStatsRow: { flexDirection: "row", gap: 10 },
    trendStat: {
      flex: 1,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.inputBg,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 4,
    },
    trendStatValue: {
      color: C.textPrimary,
      fontSize: 16,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    trendStatLabel: {
      color: C.textTertiary,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    trendChartWrap: {
      marginTop: 2,
      marginHorizontal: -2,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: C.inputBg,
    },
    trendLabelsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 2,
      paddingTop: 2,
    },
    trendLabel: {
      flex: 1,
      color: C.textTertiary,
      fontSize: 10,
      fontWeight: "700",
      textAlign: "center",
    },
    activityCard: {
      borderRadius: 28,
      borderCurve: "continuous",
      backgroundColor: C.cardBg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 18,
      gap: 16,
    },
    activityHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    chartRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 10,
    },
    chartColumn: {
      flex: 1,
      alignItems: "center",
      gap: 8,
    },
    chartCount: {
      color: C.textSecondary,
      fontSize: 11,
      fontVariant: ["tabular-nums"],
    },
    chartTrack: {
      width: "100%",
      height: 128,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor: C.inputBg,
      justifyContent: "flex-end",
      overflow: "hidden",
      padding: 6,
    },
    chartFill: {
      width: "100%",
      borderRadius: 14,
      borderCurve: "continuous",
      backgroundColor: palette.orange,
      minHeight: 10,
    },
    chartLabel: {
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: "700",
    },
  });
}
