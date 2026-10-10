import { addDays, borderWidth, colors, fonts, palette, radius, space, todayISO, type as typography } from '@loop/shared';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

import { haptic } from '@/lib/haptics';

import {
  applyRangeTap,
  canStepMonth,
  isSelectable,
  monthGrid,
  type RangeState,
} from './date-picker-model';

export interface DatePickerSheetProps {
  mode: 'single' | 'range';
  value: string | { start: string; end: string };
  onChange: (value: string | { start: string; end: string }) => void;
  onCancel?: () => void;
  allowFuture?: boolean;
  minDate?: string;
  maxRangeDays?: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DatePickerSheet({
  mode,
  value,
  onChange,
  onCancel,
  allowFuture = false,
  minDate = '2000-01-01',
  maxRangeDays = 366,
}: DatePickerSheetProps) {
  const today = todayISO();

  const initialDate = mode === 'single' ? (value as string) : (value as { start: string; end: string }).start;
  const initialYear = parseInt(initialDate.slice(0, 4), 10);
  const initialMonth = parseInt(initialDate.slice(5, 7), 10);

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [showJumpGrid, setShowJumpGrid] = useState(false);

  const [rangeState, setRangeState] = useState<RangeState>(() => {
    if (mode === 'range') {
      const range = value as { start: string; end: string };
      return { start: range.start, end: range.end };
    }
    return { start: mode === 'single' ? (value as string) : null, end: null };
  });

  const grid = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const handleDayPress = useCallback(
    (date: string) => {
      if (!isSelectable(date, today, { allowFuture, minDate })) return;

      haptic('selection');

      if (mode === 'single') {
        setRangeState({ start: date, end: null });
      } else {
        const result = applyRangeTap(rangeState, date, maxRangeDays);
        if (result.type === 'tooLong') {
          haptic('warning');
        } else {
          setRangeState(result.state);
        }
      }
    },
    [mode, rangeState, today, allowFuture, minDate, maxRangeDays],
  );

  const handleStepMonth = useCallback(
    (direction: 1 | -1) => {
      if (!canStepMonth(direction, { year: viewYear, month: viewMonth }, today, allowFuture, minDate)) return;

      haptic('selection');

      let nextMonth = viewMonth + direction;
      let nextYear = viewYear;

      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      } else if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      }

      setViewMonth(nextMonth);
      setViewYear(nextYear);
    },
    [viewYear, viewMonth, today, allowFuture, minDate],
  );

  const handleDone = useCallback(() => {
    if (mode === 'single' && rangeState.start) {
      onChange(rangeState.start);
    } else if (mode === 'range' && rangeState.start && rangeState.end) {
      onChange({ start: rangeState.start, end: rangeState.end });
    }
  }, [mode, rangeState, onChange]);

  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
  }, [onCancel]);

  const handleJumpToMonth = useCallback((year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    setShowJumpGrid(false);
    haptic('selection');
  }, []);

  const swipeGesture = Gesture.Pan()
    .onEnd((event) => {
      if (Math.abs(event.velocityX) > 500) {
        if (event.velocityX > 0) {
          handleStepMonth(-1);
        } else {
          handleStepMonth(1);
        }
      }
    });

  const isDaySelected = useCallback(
    (date: string) => {
      if (mode === 'single') {
        return rangeState.start === date;
      }
      return date === rangeState.start || date === rangeState.end;
    },
    [mode, rangeState],
  );

  const isDayInRange = useCallback(
    (date: string) => {
      if (mode !== 'range' || !rangeState.start || !rangeState.end) return false;
      return date >= rangeState.start && date <= rangeState.end;
    },
    [mode, rangeState],
  );

  const canConfirm = mode === 'single' ? rangeState.start !== null : rangeState.start !== null && rangeState.end !== null;

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={handleCancel}
      testID="date-picker-sheet">
      <Pressable style={styles.backdrop} onPress={handleDone} accessibilityRole="button" accessibilityLabel="Close date picker" testID="date-picker-backdrop">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessibilityRole="none" testID="date-picker-sheet-content">
          {showJumpGrid ? (
            <JumpGrid
              currentYear={viewYear}
              currentMonth={viewMonth}
              today={today}
              allowFuture={allowFuture}
              minDate={minDate}
              onSelect={handleJumpToMonth}
              onClose={() => setShowJumpGrid(false)}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Pressable
                  onPress={() => handleStepMonth(-1)}
                  style={styles.stepper}
                  disabled={!canStepMonth(-1, { year: viewYear, month: viewMonth }, today, allowFuture, minDate)}
                  testID="date-picker-prev"
                  accessibilityLabel="Previous month">
                  <Text style={styles.stepperText}>◀</Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowJumpGrid(true)}
                  accessibilityLabel={`${MONTH_NAMES[viewMonth - 1]} ${viewYear}`}
                  accessibilityRole="button"
                  testID="date-picker-month-title">
                  <Text style={styles.monthTitle}>
                    {MONTH_NAMES[viewMonth - 1]} {viewYear}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleStepMonth(1)}
                  style={styles.stepper}
                  disabled={!canStepMonth(1, { year: viewYear, month: viewMonth }, today, allowFuture, minDate)}
                  testID="date-picker-next"
                  accessibilityLabel="Next month">
                  <Text style={styles.stepperText}>▶</Text>
                </Pressable>
              </View>

              <View style={styles.dayNames}>
                {DAY_NAMES.map((name) => (
                  <Text key={name} style={styles.dayName}>
                    {name}
                  </Text>
                ))}
              </View>

              <GestureDetector gesture={swipeGesture}>
                <View style={styles.gridContainer}>
                  {grid.weeks.map((week, weekIndex) => (
                    <View key={weekIndex} style={styles.week}>
                      {week.map((cell) => {
                        const selectable = isSelectable(cell.date, today, { allowFuture, minDate });
                        const selected = isDaySelected(cell.date);
                        const inRange = isDayInRange(cell.date);
                        const isToday = cell.date === today;

                        return (
                          <Pressable
                            key={cell.date}
                            onPress={() => handleDayPress(cell.date)}
                            disabled={!selectable}
                            style={[
                              styles.dayCell,
                              inRange && styles.dayCellInRange,
                              selected && styles.dayCellSelected,
                              isToday && styles.dayCellToday,
                            ]}
                            testID={`date-picker-day-${cell.date}`}
                            accessibilityLabel={`${cell.day} ${MONTH_NAMES[viewMonth - 1]} ${viewYear}`}>
                            <Text
                              style={[
                                styles.dayNumber,
                                cell.outOfMonth && styles.dayNumberOutOfMonth,
                                !selectable && styles.dayNumberDisabled,
                                selected && styles.dayNumberSelected,
                              ]}>
                              {cell.day}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </GestureDetector>

              <View style={styles.actions}>
                <Pressable
                  onPress={handleCancel}
                  style={styles.actionButton}
                  testID="date-picker-cancel"
                  accessibilityLabel="Cancel">
                  <Text style={styles.actionText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleDone}
                  disabled={!canConfirm}
                  style={[styles.actionButton, styles.actionButtonPrimary, !canConfirm && styles.actionButtonDisabled]}
                  testID="date-picker-done"
                  accessibilityLabel="Done">
                  <Text style={[styles.actionText, styles.actionTextPrimary]}>Done</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface JumpGridProps {
  currentYear: number;
  currentMonth: number;
  today: string;
  allowFuture: boolean;
  minDate: string;
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}

function JumpGrid({ currentYear, currentMonth, today, allowFuture, minDate, onSelect, onClose }: JumpGridProps) {
  const todayYear = parseInt(today.slice(0, 4), 10);
  const minYear = parseInt(minDate.slice(0, 4), 10);
  const maxYear = allowFuture ? todayYear + 10 : todayYear;

  const years = [];
  for (let y = maxYear; y >= minYear; y -= 1) {
    years.push(y);
  }

  return (
    <>
      <View style={styles.jumpHeader}>
        <Text style={styles.jumpTitle}>Select Month</Text>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close"
          accessibilityRole="button"
          testID="date-picker-jump-close">
          <Text style={styles.jumpClose}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.jumpScroll}>
        {years.map((year) => (
          <View key={year}>
            <Text style={styles.jumpYear}>{year}</Text>
            <View style={styles.jumpMonthGrid}>
              {MONTH_NAMES.map((monthName, index) => {
                const month = index + 1;
                const isCurrent = year === currentYear && month === currentMonth;

                return (
                  <Pressable
                    key={monthName}
                    onPress={() => onSelect(year, month)}
                    style={[styles.jumpMonth, isCurrent && styles.jumpMonthCurrent]}
                    accessibilityLabel={`${monthName} ${year}`}
                    accessibilityRole="button"
                    testID={`date-picker-jump-${year}-${month}`}>
                    <Text style={[styles.jumpMonthText, isCurrent && styles.jumpMonthTextCurrent]}>
                      {monthName.slice(0, 3)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.slate,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space['3xl'],
    borderTopWidth: borderWidth.mechanical,
    borderLeftWidth: borderWidth.mechanical,
    borderRightWidth: borderWidth.mechanical,
    borderColor: palette.border,
    shadowColor: palette.shadowBase,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  stepper: {
    padding: space.md,
  },
  stepperText: {
    fontFamily: fonts.mono,
    fontSize: 18,
    color: palette.lime,
  },
  monthTitle: {
    fontFamily: fonts.mono,
    fontSize: 18,
    color: palette.text,
  },
  dayNames: {
    flexDirection: 'row',
    marginBottom: space.sm,
  },
  dayName: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: palette.textMuted,
    letterSpacing: 0.6,
  },
  gridContainer: {
    marginBottom: space.xl,
  },
  week: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: borderWidth.mechanical,
    borderColor: palette.border,
    marginLeft: -borderWidth.mechanical,
    marginTop: -borderWidth.mechanical,
  },
  dayCellInRange: {
    backgroundColor: palette.nested,
  },
  dayCellSelected: {
    backgroundColor: palette.lime,
  },
  dayCellToday: {
    borderColor: palette.lime,
    borderWidth: borderWidth.mechanical,
  },
  dayNumber: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: palette.text,
  },
  dayNumberOutOfMonth: {
    color: palette.textMuted,
    opacity: 0.4,
  },
  dayNumberDisabled: {
    opacity: 0.3,
  },
  dayNumberSelected: {
    color: palette.onAccent,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: radius.control,
    borderWidth: borderWidth.mechanical,
    borderColor: palette.borderStrong,
    backgroundColor: palette.nested,
    alignItems: 'center',
    shadowColor: palette.shadowSecondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  actionButtonPrimary: {
    backgroundColor: palette.lime,
    borderColor: palette.lime,
    shadowColor: palette.limeShadow,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionText: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: palette.text,
  },
  actionTextPrimary: {
    color: palette.onAccent,
  },
  jumpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  jumpTitle: {
    fontFamily: fonts.mono,
    fontSize: 18,
    color: palette.text,
  },
  jumpClose: {
    fontFamily: fonts.mono,
    fontSize: 20,
    color: palette.textMuted,
    padding: space.sm,
  },
  jumpScroll: {
    maxHeight: 500,
  },
  jumpYear: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: palette.textMuted,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  jumpMonthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  jumpMonth: {
    width: '30%',
    paddingVertical: space.md,
    borderRadius: radius.control,
    borderWidth: borderWidth.mechanical,
    borderColor: palette.border,
    backgroundColor: palette.nested,
    alignItems: 'center',
  },
  jumpMonthCurrent: {
    backgroundColor: palette.lime,
    borderColor: palette.lime,
  },
  jumpMonthText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: palette.text,
  },
  jumpMonthTextCurrent: {
    color: palette.onAccent,
  },
});
