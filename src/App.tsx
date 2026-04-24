import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { useAuth } from './contexts/AuthContext'
import { useI18n } from './i18n/I18nContext'
import { LanguageSwitcher } from './i18n/LanguageSwitcher'
import {
  countTodayPendingInCloud,
  loadDayTasksFromCloud,
  loadMonthTasksFromCloud,
  rollAllAgendasThroughToday,
  saveDayTasksToCloud,
} from './lib/dayTasksRemote'
import { getSupabase, supabaseConfigured } from './lib/supabase'
import type { Task } from './types/task'
import './App.css'

function dateKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Deixa os « de » da data (ex.: PT) mais discretos — resto inalterado. */
function dateLineWithDiscreteDe(text: string): ReactNode {
  const parts = text.split(/([\s\u00a0]de[\s\u00a0])/gi)
  return parts.map((part, i) => {
    if (/^[\s\u00a0]de[\s\u00a0]$/i.test(part)) {
      return (
        <span key={i} className="agenda__date-line-de">
          {part}
        </span>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

function monthBoundariesFromDateKey(key: string): { start: string; end: string } {
  const base = parseDateKey(key)
  const y = base.getFullYear()
  const m = base.getMonth()
  return {
    start: dateKeyFromDate(new Date(y, m, 1)),
    end: dateKeyFromDate(new Date(y, m + 1, 0)),
  }
}

function addDaysToKey(key: string, delta: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + delta)
  return dateKeyFromDate(d)
}

/** Segunda = primeira coluna (costume em PT). */
function buildMonthGridCells(year: number, month: number): { key: string; day: number; inMonth: boolean }[] {
  const firstWeekdayMon0 = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthLast = new Date(year, month, 0).getDate()
  const cells: { key: string; day: number; inMonth: boolean }[] = []

  for (let i = 0; i < firstWeekdayMon0; i++) {
    const day = prevMonthLast - firstWeekdayMon0 + i + 1
    cells.push({
      key: dateKeyFromDate(new Date(year, month - 1, day)),
      day,
      inMonth: false,
    })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      key: dateKeyFromDate(new Date(year, month, d)),
      day: d,
      inMonth: true,
    })
  }
  let tail = 1
  while (cells.length < 42) {
    cells.push({
      key: dateKeyFromDate(new Date(year, month + 1, tail)),
      day: tail,
      inMonth: false,
    })
    tail++
  }
  return cells
}

function newId(): string {
  return crypto.randomUUID()
}

function defaultTasks(): Task[] {
  return [{ id: newId(), text: '', completed: false, ignored: false }]
}

type DayRecordState = 'pending' | 'done' | 'ignored'
type AgendaKind = 'work' | 'personal'
const STORAGE_SEP = '|'
const TODAY_TASK_PREVIEW = 8

function toStorageDateKey(agenda: AgendaKind, dayKey: string): string {
  return `${agenda}${STORAGE_SEP}${dayKey}`
}

function fromStorageDateKey(storageKey: string): { agenda: AgendaKind | null; dayKey: string } {
  const sepAt = storageKey.indexOf(STORAGE_SEP)
  if (sepAt <= 0) return { agenda: null, dayKey: storageKey }
  const agenda = storageKey.slice(0, sepAt)
  if (agenda !== 'work' && agenda !== 'personal') return { agenda: null, dayKey: storageKey }
  return { agenda, dayKey: storageKey.slice(sepAt + 1) }
}

function getDayRecordState(tasks: Task[] | undefined): DayRecordState | null {
  if (!tasks || tasks.length === 0) return null

  let hasActivePending = false
  let hasCompleted = false
  let hasIgnoredWithText = false
  let hasAnyLine = false

  for (const task of tasks) {
    const t = task.text.trim()
    if (!t && !task.completed && !task.ignored) continue
    hasAnyLine = true
    if (task.ignored && t) hasIgnoredWithText = true
    if (!task.ignored && task.completed) hasCompleted = true
    if (!task.ignored && !task.completed && t) hasActivePending = true
  }

  if (!hasAnyLine) return null
  if (hasActivePending) return 'pending'
  if (hasCompleted) return 'done'
  if (hasIgnoredWithText) return 'ignored'
  return 'done'
}

const initialDateKey = dateKeyFromDate(new Date())

type CalendarPickerProps = {
  pickerMonthLabel: string
  monthCells: { key: string; day: number; inMonth: boolean }[]
  dayRecordStates: Readonly<Record<string, DayRecordState>>
  dateKey: string
  todayKey: string
  weekdayLabels: readonly [string, string, string, string, string, string, string]
  ariaPrevMonth: string
  ariaNextMonth: string
  groupAriaLabel: string
  onPrevMonth: () => void
  onNextMonth: () => void
  onPickDay: (key: string) => void
}

function CalendarPickerBody({
  pickerMonthLabel,
  monthCells,
  dayRecordStates,
  dateKey,
  todayKey,
  weekdayLabels,
  ariaPrevMonth,
  ariaNextMonth,
  groupAriaLabel,
  onPrevMonth,
  onNextMonth,
  onPickDay,
}: CalendarPickerProps) {
  return (
    <div
      id="agenda-date-picker"
      className="agenda__picker agenda__picker--screen"
      role="group"
      aria-label={groupAriaLabel}
    >
      <div className="agenda__picker-head">
        <button type="button" className="agenda__picker-nav" onClick={onPrevMonth} aria-label={ariaPrevMonth}>
          ‹
        </button>
        <span className="agenda__picker-title">{pickerMonthLabel}</span>
        <button type="button" className="agenda__picker-nav" onClick={onNextMonth} aria-label={ariaNextMonth}>
          ›
        </button>
      </div>
      <div className="agenda__picker-weekdays" aria-hidden="true">
        {weekdayLabels.map((w) => (
          <span key={w} className="agenda__picker-wd">
            {w}
          </span>
        ))}
      </div>
      <div className="agenda__picker-grid">
        {monthCells.map((cell) => {
          const isSelected = cell.key === dateKey
          const isTodayCell = cell.key === todayKey
          const dayState = dayRecordStates[cell.key]
          return (
            <button
              key={cell.key}
              type="button"
              className={[
                'agenda__picker-day',
                !cell.inMonth && 'agenda__picker-day--muted',
                isTodayCell && 'agenda__picker-day--today',
                isSelected && 'agenda__picker-day--selected',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onPickDay(cell.key)}
            >
              <span className="agenda__picker-day-num">{cell.day}</span>
              {dayState && (
                <span
                  className={[
                    'agenda__picker-day-dot',
                    dayState === 'pending'
                      ? 'agenda__picker-day-dot--pending'
                      : dayState === 'ignored'
                        ? 'agenda__picker-day-dot--ignored'
                        : 'agenda__picker-day-dot--done',
                    isSelected && 'agenda__picker-day-dot--selected',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AgendaView() {
  const { user, signOut } = useAuth()
  const { t } = useI18n()
  const sb = getSupabase()

  const [dateKey, setDateKey] = useState(initialDateKey)
  const [agendaKind, setAgendaKind] = useState<AgendaKind>('work')
  const [drafts, setDrafts] = useState<Record<string, Task[]>>({})
  const [saveHint, setSaveHint] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => parseDateKey(initialDateKey).getFullYear())
  const [pickerMonth, setPickerMonth] = useState(() => parseDateKey(initialDateKey).getMonth())
  const [loadedMonthKeys, setLoadedMonthKeys] = useState<Record<string, true>>({})
  const [workTodayPendingCount, setWorkTodayPendingCount] = useState(0)
  const [personalTodayPendingCount, setPersonalTodayPendingCount] = useState(0)
  const [expandedTodayTasks, setExpandedTodayTasks] = useState(false)
  const [dayClock, setDayClock] = useState(0)

  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  const activeStorageKey = useMemo(() => toStorageDateKey(agendaKind, dateKey), [agendaKind, dateKey])
  const activeStorageKeyRef = useRef(activeStorageKey)
  activeStorageKeyRef.current = activeStorageKey

  const todayKey = useMemo(() => dateKeyFromDate(new Date()), [dayClock])
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setDayClock((c) => c + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!user || !sb) return
    if (draftsRef.current[activeStorageKey] !== undefined) return

    let cancelled = false
    ;(async () => {
      const remote = await loadDayTasksFromCloud(sb, user.id, activeStorageKey)
      if (cancelled) return
      setDrafts((prev) =>
        prev[activeStorageKey] !== undefined ? prev : { ...prev, [activeStorageKey]: remote ?? defaultTasks() },
      )
    })()

    return () => {
      cancelled = true
    }
  }, [activeStorageKey, user?.id, sb])

  useEffect(() => {
    if (!user || !sb) return
    const monthKey = `${agendaKind}:${dateKey.slice(0, 7)}`
    if (loadedMonthKeys[monthKey]) return

    const { start, end } = monthBoundariesFromDateKey(dateKey)
    const monthStartStorage = toStorageDateKey(agendaKind, start)
    const monthEndStorage = toStorageDateKey(agendaKind, end)
    let cancelled = false

    ;(async () => {
      const monthDrafts = await loadMonthTasksFromCloud(sb, user.id, monthStartStorage, monthEndStorage)
      if (cancelled) return
      setDrafts((prev) => ({ ...monthDrafts, ...prev }))
      setLoadedMonthKeys((prev) => ({ ...prev, [monthKey]: true }))
    })()

    return () => {
      cancelled = true
    }
  }, [agendaKind, dateKey, user?.id, sb, loadedMonthKeys])

  useEffect(() => {
    if (!pickerOpen) return
    const d = parseDateKey(dateKey)
    setPickerYear(d.getFullYear())
    setPickerMonth(d.getMonth())
  }, [pickerOpen, dateKey])

  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pickerOpen])

  useEffect(() => {
    document.body.style.overflow = pickerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [pickerOpen])

  useEffect(() => {
    if (dateKey < dateKeyFromDate(new Date())) setSaveHint(null)
  }, [dateKey, agendaKind])

  const refreshTodayPendingBadges = useCallback(async () => {
    if (!sb || !user) return
    const tk = dateKeyFromDate(new Date())
    const [workN, personalN] = await Promise.all([
      countTodayPendingInCloud(sb, user.id, 'work', tk),
      countTodayPendingInCloud(sb, user.id, 'personal', tk),
    ])
    setWorkTodayPendingCount(workN)
    setPersonalTodayPendingCount(personalN)
  }, [sb, user?.id])

  useEffect(() => {
    if (!user || !sb) return
    let cancelled = false
    void (async () => {
      const tk = dateKeyFromDate(new Date())
      const didRoll = await rollAllAgendasThroughToday(sb, user.id, tk)
      if (cancelled) return
      if (didRoll) {
        setDrafts({})
        setLoadedMonthKeys({})
      }
      void refreshTodayPendingBadges()
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, sb, dayClock, refreshTodayPendingBadges])

  const goToDate = useCallback((key: string) => {
    setDateKey(key)
  }, [])

  const tasks = drafts[activeStorageKey]

  const setTasksForDay = useCallback(
    (updater: Task[] | ((prev: Task[]) => Task[])) => {
      setDrafts((prev) => {
        const current = prev[activeStorageKey]
        if (!current) return prev
        const next = typeof updater === 'function' ? updater(current) : updater
        return { ...prev, [activeStorageKey]: next }
      })
    },
    [activeStorageKey],
  )
  const isToday = dateKey === todayKey
  const isPastDay = dateKey < todayKey

  const todayTaskPreview =
    tasks !== undefined && isToday && tasks.length > TODAY_TASK_PREVIEW && !expandedTodayTasks
  const tasksToShow =
    tasks === undefined ? undefined : todayTaskPreview ? tasks.slice(0, TODAY_TASK_PREVIEW) : tasks
  const hiddenTodayTasks =
    tasks !== undefined && todayTaskPreview ? tasks.length - TODAY_TASK_PREVIEW : 0

  useEffect(() => {
    if (dateKey !== todayKey) setExpandedTodayTasks(false)
  }, [dateKey, todayKey])

  const autoSavePayload = useMemo(() => {
    if (!user || !sb) return null
    const list = drafts[activeStorageKey]
    if (list === undefined) return null
    return JSON.stringify(list)
  }, [drafts, activeStorageKey, user, sb])

  useEffect(() => {
    if (autoSavePayload === null) {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      return
    }
    if (!sb || !user) return

    if (autoSaveTimerRef.current != null) window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null
      void (async () => {
        const key = activeStorageKeyRef.current
        const list = draftsRef.current[key]
        if (!list) return
        const err = await saveDayTasksToCloud(sb, user.id, key, list)
        if (err) {
          setSaveHint(err)
          window.setTimeout(() => setSaveHint(null), 5000)
          return
        }
        void refreshTodayPendingBadges()
      })()
    }, 650)

    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [autoSavePayload, sb, user?.id, refreshTodayPendingBadges])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        setDayClock((c) => c + 1)
        return
      }
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      if (!sb || !user) return
      const key = activeStorageKeyRef.current
      const list = draftsRef.current[key]
      if (!list) return
      void (async () => {
        const err = await saveDayTasksToCloud(sb, user.id, key, list)
        if (err) {
          setSaveHint(err)
          window.setTimeout(() => setSaveHint(null), 5000)
          return
        }
        void refreshTodayPendingBadges()
      })()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refreshTodayPendingBadges, sb, user?.id])

  const formatted = useMemo(() => {
    const d = parseDateKey(dateKey)
    const loc = t.dateLocale
    const weekday = new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(d)
    const dateLine = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    return { weekday, dateLine }
  }, [dateKey, t.dateLocale])

  const goToToday = () => {
    goToDate(dateKeyFromDate(new Date()))
    setPickerOpen(false)
  }

  const shiftPickerMonth = (delta: number) => {
    const d = new Date(pickerYear, pickerMonth + delta, 1)
    setPickerYear(d.getFullYear())
    setPickerMonth(d.getMonth())
  }

  const pickerMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(t.dateLocale, { month: 'long', year: 'numeric' }).format(
        new Date(pickerYear, pickerMonth, 1),
      ),
    [pickerYear, pickerMonth, t.dateLocale],
  )

  const monthCells = useMemo(
    () => buildMonthGridCells(pickerYear, pickerMonth),
    [pickerYear, pickerMonth],
  )
  const dayRecordStates = useMemo(() => {
    const states: Record<string, DayRecordState> = {}
    for (const [storageKey, dayTasks] of Object.entries(drafts)) {
      const parsed = fromStorageDateKey(storageKey)
      if (parsed.agenda !== agendaKind) continue
      const state = getDayRecordState(dayTasks)
      if (state) states[parsed.dayKey] = state
    }
    return states
  }, [drafts, agendaKind])

  const pickDay = (key: string) => {
    goToDate(key)
    setPickerOpen(false)
  }

  const updateTask = (id: string, patch: Partial<Task>) => {
    if (isPastDay) {
      const keys = Object.keys(patch) as (keyof Task)[]
      const onlyStatus = keys.length > 0 && keys.every((k) => k === 'completed' || k === 'ignored')
      if (!onlyStatus) return
    }
    setTasksForDay((list) =>
      list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    )
  }

  const addField = () => {
    if (isPastDay) return
    setTasksForDay((list) => [...list, { id: newId(), text: '', completed: false, ignored: false }])
  }

  return (
    <div className="sakura-app">
      <div className={`agenda agenda--${agendaKind}${pickerOpen ? ' agenda--calendar-open' : ''}`}>
        {pickerOpen ? (
          <div
            className="agenda__calendar-screen"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPickerOpen(false)
            }}
          >
            <div
              className="agenda__calendar-screen-inner"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agenda-picker-title"
            >
              <header className="agenda__screen-head">
                <button
                  type="button"
                  className="agenda__screen-back"
                  onClick={() => setPickerOpen(false)}
                >
                  {t.screenBack}
                </button>
                <h2 id="agenda-picker-title" className="agenda__screen-title">
                  {t.screenChooseDay}
                </h2>
                <button type="button" className="agenda__screen-today" onClick={goToToday}>
                  {t.screenToday}
                </button>
              </header>
              <CalendarPickerBody
                pickerMonthLabel={pickerMonthLabel}
                monthCells={monthCells}
                dayRecordStates={dayRecordStates}
                dateKey={dateKey}
                todayKey={todayKey}
                weekdayLabels={t.weekdayShort}
                ariaPrevMonth={t.calendarPrevMonth}
                ariaNextMonth={t.calendarNextMonth}
                groupAriaLabel={t.pickerCalendarGroup}
                onPrevMonth={() => shiftPickerMonth(-1)}
                onNextMonth={() => shiftPickerMonth(1)}
                onPickDay={pickDay}
              />
            </div>
          </div>
        ) : (
          <>
            <header className="agenda__header">
              <div className="agenda__calendar-row">
                <LanguageSwitcher className="agenda__lang" />
                <div className="agenda__scope" role="tablist" aria-label={t.agendaSwitcher}>
                  <div className={`agenda__scope-col${agendaKind === 'work' ? ' agenda__scope-col--active' : ''}`}>
                    <div
                      className="agenda__scope-badges"
                      aria-label={t.ariaBadgeWorkToday.replace('{{count}}', String(workTodayPendingCount))}
                    >
                      {workTodayPendingCount > 0 && (
                        <span className="agenda__scope-dot" title={t.badgeTodayPendingTooltip} aria-hidden="true" />
                      )}
                      <span
                        className={`agenda__scope-count${workTodayPendingCount === 0 ? ' agenda__scope-count--zero' : ''}`}
                      >
                        {workTodayPendingCount}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={agendaKind === 'work'}
                      className={`agenda__scope-btn${agendaKind === 'work' ? ' agenda__scope-btn--active' : ''}`}
                      onClick={() => setAgendaKind('work')}
                    >
                      {t.agendaWork}
                    </button>
                  </div>
                  <div className={`agenda__scope-col${agendaKind === 'personal' ? ' agenda__scope-col--active' : ''}`}>
                    <div
                      className="agenda__scope-badges"
                      aria-label={t.ariaBadgePersonalToday.replace(
                        '{{count}}',
                        String(personalTodayPendingCount),
                      )}
                    >
                      {personalTodayPendingCount > 0 && (
                        <span className="agenda__scope-dot" title={t.badgeTodayPendingTooltip} aria-hidden="true" />
                      )}
                      <span
                        className={`agenda__scope-count${
                          personalTodayPendingCount === 0 ? ' agenda__scope-count--zero' : ''
                        }`}
                      >
                        {personalTodayPendingCount}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={agendaKind === 'personal'}
                      className={`agenda__scope-btn${agendaKind === 'personal' ? ' agenda__scope-btn--active' : ''}`}
                      onClick={() => setAgendaKind('personal')}
                    >
                      {t.agendaPersonal}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="agenda__calendar"
                  title={t.calendarOpenTitle}
                  aria-haspopup="dialog"
                  onClick={() => setPickerOpen(true)}
                >
                  <span className="agenda__calendar-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                {!isToday && (
                  <button type="button" className="agenda__hoje-btn" onClick={goToToday}>
                    {t.today}
                  </button>
                )}
                <button type="button" className="agenda__signout" onClick={() => void signOut()}>
                  {t.signOut}
                </button>
              </div>

              <div className="agenda__nav">
                <button
                  type="button"
                  className="agenda__arrow"
                  onClick={() => goToDate(addDaysToKey(dateKey, -1))}
                  aria-label={t.ariaYesterday}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="agenda__date-block agenda__date-block--click"
                  onClick={() => setPickerOpen(true)}
                  aria-label={t.ariaOpenCalendar}
                >
                  {isToday && (
                    <p className="agenda__hoje-ref" aria-current="date">
                      {t.today}
                    </p>
                  )}
                  <p className="agenda__date-line">{dateLineWithDiscreteDe(formatted.dateLine)}</p>
                  <p className="agenda__weekday">{formatted.weekday}</p>
                </button>
                <button
                  type="button"
                  className="agenda__arrow"
                  onClick={() => goToDate(addDaysToKey(dateKey, 1))}
                  aria-label={t.ariaTomorrow}
                >
                  ›
                </button>
              </div>
            </header>

            <main className="agenda__main">
              {tasks === undefined ? (
                <p className="agenda__loading">{t.loadingDay}</p>
              ) : (
                <>
                  {isPastDay && <p className="agenda__readonly-note">{t.pastDayNote}</p>}
                  <ul className="agenda__tasks">
                    {(tasksToShow ?? []).map((task) => (
                      <li key={task.id} className={`agenda__task${task.ignored ? ' agenda__task--ignored' : ''}`}>
                        <span
                          className={`agenda__dot ${
                            task.ignored ? 'agenda__dot--ignored' : task.completed ? 'agenda__dot--done' : 'agenda__dot--pending'
                          }`}
                          title={
                            task.ignored ? t.taskIgnored : task.completed ? t.taskDone : t.taskTodo
                          }
                          aria-hidden
                        />
                        <input
                          type="text"
                          className={`agenda__input${isPastDay ? ' agenda__input--locked' : ''}`}
                          value={task.text}
                          readOnly={isPastDay}
                          onChange={(e) => updateTask(task.id, { text: e.target.value })}
                          placeholder={t.taskPlaceholder}
                          aria-label={t.ariaTaskText}
                        />
                        {(task.ignored || task.text.trim().length > 0) && (
                          <button
                            type="button"
                            className="agenda__task-ignore"
                            aria-label={task.ignored ? t.ariaRestoreTask : t.ariaIgnoreTask}
                            onClick={() =>
                              updateTask(task.id, task.ignored ? { ignored: false } : { ignored: true, completed: false })
                            }
                          >
                            ×
                          </button>
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={task.completed}
                          disabled={Boolean(task.ignored)}
                          aria-label={task.completed ? t.ariaMarkTodo : t.ariaMarkDone}
                          className={`agenda__switch ${task.completed ? 'agenda__switch--done' : ''}`}
                          onClick={() => updateTask(task.id, { completed: !task.completed })}
                        >
                          <span className="agenda__switch-knob" />
                        </button>
                      </li>
                    ))}
                  </ul>

                  {hiddenTodayTasks > 0 && (
                    <button
                      type="button"
                      className="agenda__tasks-more"
                      onClick={() => setExpandedTodayTasks(true)}
                      aria-label={t.showMoreTasks.replace('{{n}}', String(hiddenTodayTasks))}
                    >
                      {t.showMoreTasks.replace('{{n}}', String(hiddenTodayTasks))}
                    </button>
                  )}

                  {!isPastDay && (
                    <button type="button" className="agenda__add" onClick={addField} aria-label={t.ariaAddField}>
                      +
                    </button>
                  )}
                </>
              )}
            </main>

            <footer className="agenda__footer">
              {saveHint && <span className="agenda__saved">{saveHint}</span>}
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function SetupMissing() {
  const { t } = useI18n()
  return (
    <div className="sakura-app">
      <div className="setup-miss">
        <div className="setup-miss__head">
          <LanguageSwitcher />
        </div>
        <h2 className="setup-miss__title">{t.setupTitle}</h2>
        <p className="setup-miss__p">
          {t.setupP1a}
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
            supabase.com
          </a>
          {t.setupP1b}
          <code className="setup-miss__code">.env</code>
          {t.setupP1c}
        </p>
        <pre className="setup-miss__pre">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...`}</pre>
        <p className="setup-miss__p">{t.setupP2}</p>
        <p className="setup-miss__p">{t.setupP3}</p>
      </div>
    </div>
  )
}

function AppWithSupabase() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  if (loading) {
    return (
      <div className="sakura-app" aria-busy="true">
        <div className="agenda agenda--loading-shell">
          <p className="agenda__loading">{t.loadingSession}</p>
        </div>
      </div>
    )
  }
  if (!user) {
    return (
      <div className="sakura-app">
        <AuthScreen />
      </div>
    )
  }
  return <AgendaView />
}

export default function App() {
  if (!supabaseConfigured) {
    return <SetupMissing />
  }
  return <AppWithSupabase />
}
