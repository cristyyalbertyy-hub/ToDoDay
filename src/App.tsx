import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { useAuth } from './contexts/AuthContext'
import { useI18n } from './i18n/I18nContext'
import { LanguageSwitcher } from './i18n/LanguageSwitcher'
import { loadDayTasksFromCloud, loadMonthTasksFromCloud, saveDayTasksToCloud } from './lib/dayTasksRemote'
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
  return [{ id: newId(), text: '', completed: false }]
}

type DayRecordState = 'pending' | 'done'
type PendingMonthItem = { id: string; dateKey: string; text: string }

function getDayRecordState(tasks: Task[] | undefined): DayRecordState | null {
  if (!tasks || tasks.length === 0) return null

  let hasPending = false
  let hasDone = false

  for (const task of tasks) {
    const hasContent = task.completed || task.text.trim().length > 0
    if (!hasContent) continue
    if (task.completed) hasDone = true
    else hasPending = true
  }

  if (!hasPending && !hasDone) return null
  return hasPending ? 'pending' : 'done'
}

function monthLabelFromDateKey(key: string, locale: string): string {
  const d = parseDateKey(key)
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(d)
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
                    dayState === 'pending' ? 'agenda__picker-day-dot--pending' : 'agenda__picker-day-dot--done',
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
  const [drafts, setDrafts] = useState<Record<string, Task[]>>({})
  const [saveHint, setSaveHint] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => parseDateKey(initialDateKey).getFullYear())
  const [pickerMonth, setPickerMonth] = useState(() => parseDateKey(initialDateKey).getMonth())
  const [loadedMonthKeys, setLoadedMonthKeys] = useState<Record<string, true>>({})

  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  useEffect(() => {
    if (!user || !sb) return
    if (draftsRef.current[dateKey] !== undefined) return

    let cancelled = false
    ;(async () => {
      const remote = await loadDayTasksFromCloud(sb, user.id, dateKey)
      if (cancelled) return
      setDrafts((prev) =>
        prev[dateKey] !== undefined ? prev : { ...prev, [dateKey]: remote ?? defaultTasks() },
      )
    })()

    return () => {
      cancelled = true
    }
  }, [dateKey, user?.id, sb])

  useEffect(() => {
    if (!user || !sb) return
    const monthKey = dateKey.slice(0, 7)
    if (loadedMonthKeys[monthKey]) return

    const { start, end } = monthBoundariesFromDateKey(dateKey)
    let cancelled = false

    ;(async () => {
      const monthDrafts = await loadMonthTasksFromCloud(sb, user.id, start, end)
      if (cancelled) return
      setDrafts((prev) => ({ ...monthDrafts, ...prev }))
      setLoadedMonthKeys((prev) => ({ ...prev, [monthKey]: true }))
    })()

    return () => {
      cancelled = true
    }
  }, [dateKey, user?.id, sb, loadedMonthKeys])

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
  }, [dateKey])

  const goToDate = useCallback((key: string) => {
    setDateKey(key)
  }, [])

  const tasks = drafts[dateKey]

  const setTasksForDay = useCallback(
    (updater: Task[] | ((prev: Task[]) => Task[])) => {
      setDrafts((prev) => {
        const current = prev[dateKey]
        if (!current) return prev
        const next = typeof updater === 'function' ? updater(current) : updater
        return { ...prev, [dateKey]: next }
      })
    },
    [dateKey],
  )

  const todayKey = dateKeyFromDate(new Date())
  const isToday = dateKey === todayKey
  const isPastDay = dateKey < todayKey

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
    for (const [key, dayTasks] of Object.entries(drafts)) {
      const state = getDayRecordState(dayTasks)
      if (state) states[key] = state
    }
    return states
  }, [drafts])

  const monthPendingItems = useMemo(() => {
    const monthPrefix = dateKey.slice(0, 7)
    const items: PendingMonthItem[] = []
    for (const [dayKey, dayTasks] of Object.entries(drafts)) {
      if (!dayKey.startsWith(monthPrefix) || dayKey === todayKey) continue
      for (const task of dayTasks) {
        const text = task.text.trim()
        if (!task.completed && text.length > 0) {
          items.push({ id: task.id, dateKey: dayKey, text })
        }
      }
    }
    items.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    return items
  }, [drafts, dateKey, todayKey])

  const monthName = useMemo(() => monthLabelFromDateKey(dateKey, t.dateLocale), [dateKey, t.dateLocale])
  const monthPendingCountLabel = t.monthlyPendingCount
    .replace('{{count}}', String(monthPendingItems.length))
    .replace('{{month}}', monthName)

  const pickDay = (key: string) => {
    goToDate(key)
    setPickerOpen(false)
  }

  const handleSave = async () => {
    if (isPastDay) return
    const list = drafts[dateKey]
    if (!list || !sb || !user) return
    const err = await saveDayTasksToCloud(sb, user.id, dateKey, list)
    if (err) {
      setSaveHint(err)
      window.setTimeout(() => setSaveHint(null), 5000)
      return
    }
    setSaveHint(t.saved)
    window.setTimeout(() => setSaveHint(null), 2000)
  }

  const updateTask = (id: string, patch: Partial<Task>) => {
    if (isPastDay) return
    setTasksForDay((list) =>
      list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    )
  }

  const addField = () => {
    if (isPastDay) return
    setTasksForDay((list) => [...list, { id: newId(), text: '', completed: false }])
  }

  const moveTaskToToday = async (fromDateKey: string, taskId: string) => {
    if (!sb || !user) return
    if (fromDateKey === todayKey) return

    const source = drafts[fromDateKey]
    if (!source) return
    const moving = source.find((task) => task.id === taskId)
    if (!moving) return

    const nextSource = source.filter((task) => task.id !== taskId)
    const todayTasks = drafts[todayKey] ?? defaultTasks()
    const cleanedToday = todayTasks.filter((task) => task.text.trim().length > 0 || task.completed)
    const nextToday = [...cleanedToday, { ...moving, id: newId(), completed: false }]

    setDrafts((prev) => ({
      ...prev,
      [fromDateKey]: nextSource.length ? nextSource : defaultTasks(),
      [todayKey]: nextToday,
    }))

    const sourceErr = await saveDayTasksToCloud(sb, user.id, fromDateKey, nextSource.length ? nextSource : defaultTasks())
    const todayErr = await saveDayTasksToCloud(sb, user.id, todayKey, nextToday)
    if (sourceErr || todayErr) {
      setSaveHint(sourceErr ?? todayErr ?? null)
      window.setTimeout(() => setSaveHint(null), 5000)
      return
    }

    setSaveHint(t.movedToToday)
    window.setTimeout(() => setSaveHint(null), 2500)
  }

  const moveAllPendingToToday = async () => {
    if (!sb || !user) return
    if (monthPendingItems.length === 0) return
    if (!window.confirm(t.confirmMoveAllToToday)) return

    const idsByDay: Record<string, Set<string>> = {}
    for (const item of monthPendingItems) {
      if (!idsByDay[item.dateKey]) idsByDay[item.dateKey] = new Set<string>()
      idsByDay[item.dateKey].add(item.id)
    }

    const updatedByDay: Record<string, Task[]> = {}
    const movedTasks: Task[] = []
    for (const [fromDateKey, idSet] of Object.entries(idsByDay)) {
      const source = drafts[fromDateKey] ?? []
      const keep: Task[] = []
      for (const task of source) {
        if (idSet.has(task.id)) movedTasks.push(task)
        else keep.push(task)
      }
      updatedByDay[fromDateKey] = keep.length ? keep : defaultTasks()
    }

    if (movedTasks.length === 0) return

    const todayTasks = drafts[todayKey] ?? defaultTasks()
    const cleanedToday = todayTasks.filter((task) => task.text.trim().length > 0 || task.completed)
    const movedToToday = movedTasks.map((task) => ({ ...task, id: newId(), completed: false }))
    const nextToday = [...cleanedToday, ...movedToToday]

    setDrafts((prev) => ({
      ...prev,
      ...updatedByDay,
      [todayKey]: nextToday,
    }))

    const saveErrors = await Promise.all([
      ...Object.entries(updatedByDay).map(([fromDateKey, nextSource]) =>
        saveDayTasksToCloud(sb, user.id, fromDateKey, nextSource),
      ),
      saveDayTasksToCloud(sb, user.id, todayKey, nextToday),
    ])
    const firstErr = saveErrors.find((err) => Boolean(err))
    if (firstErr) {
      setSaveHint(firstErr)
      window.setTimeout(() => setSaveHint(null), 5000)
      return
    }

    setSaveHint(t.movedAllToToday)
    window.setTimeout(() => setSaveHint(null), 2500)
  }

  return (
    <div className="sakura-app">
      <div className={`agenda${pickerOpen ? ' agenda--calendar-open' : ''}`}>
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
                  <p className="agenda__date-line">{formatted.dateLine}</p>
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
                  {isPastDay && <p className="agenda__readonly-note">{t.readOnlyPastDay}</p>}
                  <ul className="agenda__tasks">
                    {tasks.map((task) => (
                      <li key={task.id} className="agenda__task">
                        <span
                          className={`agenda__dot ${task.completed ? 'agenda__dot--done' : 'agenda__dot--pending'}`}
                          title={task.completed ? t.taskDone : t.taskTodo}
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
                        <button
                          type="button"
                          role="switch"
                          aria-checked={task.completed}
                          disabled={isPastDay}
                          aria-label={task.completed ? t.ariaMarkTodo : t.ariaMarkDone}
                          className={`agenda__switch ${task.completed ? 'agenda__switch--done' : ''}`}
                          onClick={() => updateTask(task.id, { completed: !task.completed })}
                        >
                          <span className="agenda__switch-knob" />
                        </button>
                      </li>
                    ))}
                  </ul>

                  {!isPastDay && (
                    <button type="button" className="agenda__add" onClick={addField} aria-label={t.ariaAddField}>
                      +
                    </button>
                  )}
                </>
              )}
            </main>

            <section className="agenda__month-pending" aria-label={t.monthlyPendingTitle}>
              <div className="agenda__month-pending-head">
                <h3 className="agenda__month-pending-title">{t.monthlyPendingTitle}</h3>
                {monthPendingItems.length > 0 && (
                  <button type="button" className="agenda__month-pending-move-all" onClick={() => void moveAllPendingToToday()}>
                    {t.moveAllToToday}
                  </button>
                )}
              </div>
              <p className="agenda__month-pending-count">{monthPendingCountLabel}</p>
              {monthPendingItems.length === 0 ? (
                <p className="agenda__month-pending-empty">{t.monthlyPendingEmpty}</p>
              ) : (
                <ul className="agenda__month-pending-list">
                  {monthPendingItems.map((item) => (
                    <li key={`${item.dateKey}-${item.id}`} className="agenda__month-pending-item">
                      <span className="agenda__month-pending-date">
                        {new Intl.DateTimeFormat(t.dateLocale, {
                          day: '2-digit',
                          month: '2-digit',
                        }).format(parseDateKey(item.dateKey))}
                      </span>
                      <span className="agenda__month-pending-text">{item.text}</span>
                      <button
                        type="button"
                        className="agenda__month-pending-move"
                        onClick={() => void moveTaskToToday(item.dateKey, item.id)}
                      >
                        {t.moveToToday}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <footer className={`agenda__footer${isPastDay ? ' agenda__footer--readonly' : ''}`}>
              {saveHint && <span className="agenda__saved">{saveHint}</span>}
              {!isPastDay && (
                <button
                  type="button"
                  className="agenda__save"
                  disabled={tasks === undefined}
                  onClick={() => void handleSave()}
                >
                  {t.save}
                </button>
              )}
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
