import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '../types/task'

function splitStorageDateKey(dateKey: string): { agenda: 'work' | 'personal' | null; dayKey: string } {
  const i = dateKey.indexOf('|')
  if (i <= 0) return { agenda: null, dayKey: dateKey }
  const a = dateKey.slice(0, i)
  const d = dateKey.slice(i + 1)
  if (a === 'work' || a === 'personal') return { agenda: a, dayKey: d }
  return { agenda: null, dayKey: dateKey }
}

function parseTasksJson(raw: unknown): Task[] | null {
  if (!Array.isArray(raw)) return null
  const tasks: Task[] = []
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      'id' in item &&
      'text' in item &&
      'completed' in item
    ) {
      const t = item as Task
      tasks.push({
        id: String(t.id),
        text: String(t.text),
        completed: Boolean(t.completed),
        ignored: Boolean(t.ignored),
        ...(typeof t.rolledFromId === 'string' && t.rolledFromId ? { rolledFromId: t.rolledFromId } : {}),
        ...(typeof t.rolledFromDayKey === 'string' && t.rolledFromDayKey
          ? { rolledFromDayKey: t.rolledFromDayKey }
          : {}),
      })
    }
  }
  return tasks.length ? tasks : null
}

function countActivePendingInTaskList(tasks: Task[]): number {
  let n = 0
  for (const task of tasks) {
    if (!task.ignored && !task.completed && task.text.trim().length > 0) n++
  }
  return n
}

function addCalendarDay(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** v3: roll por cópia (originais ficam no dia anterior para consulta). */
function rollAnchorStorageKey(userId: string, agenda: 'work' | 'personal'): string {
  return `tododay.rollAnchor.v3.${userId}.${agenda}`
}

function emptyDayTaskList(): Task[] {
  return [{ id: crypto.randomUUID(), text: '', completed: false, ignored: false }]
}

function toStorageDateKey(agenda: 'work' | 'personal', dayKey: string): string {
  return `${agenda}|${dayKey}`
}

/** Pendentes activas só no dia `todayDayKey` (chave `agenda|YYYY-MM-DD`). */
export async function countTodayPendingInCloud(
  sb: SupabaseClient,
  userId: string,
  agenda: 'work' | 'personal',
  todayDayKey: string,
): Promise<number> {
  const storageKey = toStorageDateKey(agenda, todayDayKey)
  const list = await loadDayTasksFromCloud(sb, userId, storageKey)
  if (!list) return 0
  return countActivePendingInTaskList(list)
}

function hasRollCopyOnDay(
  toList: Task[],
  sourceTaskId: string,
  sourceCalendarDayKey: string,
): boolean {
  return toList.some(
    (t) => t.rolledFromId === sourceTaskId && t.rolledFromDayKey === sourceCalendarDayKey,
  )
}

/**
 * Copia pendentes do dia `fromDayKey` para o dia seguinte (no topo do destino).
 * O dia de origem não é alterado — as vermelhas ficam para consulta.
 * Idempotente: não duplica se já existir cópia com o mesmo par (dia de origem + id da tarefa).
 */
async function rollOneDayPairResult(
  sb: SupabaseClient,
  userId: string,
  agenda: 'work' | 'personal',
  fromDayKey: string,
  toDayKey: string,
): Promise<{ error: string | null; mutated: boolean }> {
  const toStorage = toStorageDateKey(agenda, toDayKey)

  const fromRaw = await loadDayTasksFromCloud(sb, userId, toStorageDateKey(agenda, fromDayKey))
  const fromList = fromRaw ?? []

  const pending: Task[] = []
  for (const t of fromList) {
    if (!t.ignored && !t.completed && t.text.trim().length > 0) pending.push(t)
  }

  if (pending.length === 0) return { error: null, mutated: false }

  const toRaw = await loadDayTasksFromCloud(sb, userId, toStorage)
  const toList = toRaw && toRaw.length > 0 ? [...toRaw] : emptyDayTaskList()

  const toAdd: Task[] = []
  for (const p of pending) {
    if (hasRollCopyOnDay(toList, p.id, fromDayKey)) continue
    if (hasRollCopyOnDay(toAdd, p.id, fromDayKey)) continue
    toAdd.push({
      id: crypto.randomUUID(),
      text: p.text,
      completed: false,
      ignored: false,
      rolledFromId: p.id,
      rolledFromDayKey: fromDayKey,
    })
  }

  if (toAdd.length === 0) return { error: null, mutated: false }

  const newTo = [...toAdd, ...toList]

  const errTo = await saveDayTasksToCloud(sb, userId, toStorage, newTo)
  if (errTo) return { error: errTo, mutated: false }

  return { error: null, mutated: true }
}

/**
 * Faz apenas o roll de ontem -> hoje.
 * Mantém idempotência via `rollOneDayPairResult` (não duplica cópias já existentes).
 */
export async function rollAgendaThroughToday(
  sb: SupabaseClient,
  userId: string,
  agenda: 'work' | 'personal',
  todayDayKey: string,
): Promise<boolean> {
  const lsKey = rollAnchorStorageKey(userId, agenda)
  const yesterday = addCalendarDay(todayDayKey, -1)
  const r = await rollOneDayPairResult(sb, userId, agenda, yesterday, todayDayKey)
  if (r.error) {
    console.error(r.error)
    return false
  }
  localStorage.setItem(lsKey, todayDayKey)
  return r.mutated
}

export async function rollAllAgendasThroughToday(
  sb: SupabaseClient,
  userId: string,
  todayDayKey: string,
): Promise<boolean> {
  const w = await rollAgendaThroughToday(sb, userId, 'work', todayDayKey)
  const p = await rollAgendaThroughToday(sb, userId, 'personal', todayDayKey)
  return w || p
}

async function migrateLegacyDayToWork(
  sb: SupabaseClient,
  userId: string,
  legacyKey: string,
  workKey: string,
  tasks: Task[],
): Promise<void> {
  const { error: upErr } = await sb.from('day_tasks').upsert(
    {
      user_id: userId,
      date_key: workKey,
      tasks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,date_key' },
  )
  if (upErr) {
    console.error(upErr)
    return
  }
  const { error: delErr } = await sb.from('day_tasks').delete().eq('user_id', userId).eq('date_key', legacyKey)
  if (delErr) console.error(delErr)
}

export async function loadDayTasksFromCloud(
  sb: SupabaseClient,
  userId: string,
  dateKey: string,
): Promise<Task[] | null> {
  const { data, error } = await sb
    .from('day_tasks')
    .select('tasks')
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .maybeSingle()

  if (error) {
    console.error(error)
    return null
  }
  if (data?.tasks != null) {
    const parsed = parseTasksJson(data.tasks)
    if (parsed) return parsed
  }

  const { agenda, dayKey } = splitStorageDateKey(dateKey)
  if (agenda !== 'work') return null

  const { data: leg, error: legErr } = await sb
    .from('day_tasks')
    .select('tasks')
    .eq('user_id', userId)
    .eq('date_key', dayKey)
    .maybeSingle()

  if (legErr) {
    console.error(legErr)
    return null
  }
  if (!leg?.tasks) return null
  const legacyTasks = parseTasksJson(leg.tasks)
  if (!legacyTasks) return null

  await migrateLegacyDayToWork(sb, userId, dayKey, dateKey, legacyTasks)
  return legacyTasks
}

export async function saveDayTasksToCloud(
  sb: SupabaseClient,
  userId: string,
  dateKey: string,
  tasks: Task[],
): Promise<string | null> {
  const { error } = await sb.from('day_tasks').upsert(
    {
      user_id: userId,
      date_key: dateKey,
      tasks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,date_key' },
  )
  if (error) return error.message

  const { agenda, dayKey } = splitStorageDateKey(dateKey)
  if (agenda === 'work') {
    const { error: delErr } = await sb.from('day_tasks').delete().eq('user_id', userId).eq('date_key', dayKey)
    if (delErr) console.error(delErr)
  }

  return null
}

export async function loadMonthTasksFromCloud(
  sb: SupabaseClient,
  userId: string,
  monthStartKey: string,
  monthEndKey: string,
): Promise<Record<string, Task[]>> {
  const { data, error } = await sb
    .from('day_tasks')
    .select('date_key,tasks')
    .eq('user_id', userId)
    .gte('date_key', monthStartKey)
    .lte('date_key', monthEndKey)

  if (error) {
    console.error(error)
    return {}
  }

  const out: Record<string, Task[]> = {}
  for (const row of data ?? []) {
    const parsed = parseTasksJson(row.tasks)
    if (parsed) out[row.date_key] = parsed
  }

  const { agenda, dayKey: startDay } = splitStorageDateKey(monthStartKey)
  const { dayKey: endDay } = splitStorageDateKey(monthEndKey)
  if (agenda !== 'work' || !startDay || !endDay) return out

  const { data: legacyRows, error: legErr } = await sb
    .from('day_tasks')
    .select('date_key,tasks')
    .eq('user_id', userId)
    .gte('date_key', startDay)
    .lte('date_key', endDay)
    .not('date_key', 'like', '%|%')

  if (legErr) {
    console.error(legErr)
    return out
  }

  for (const row of legacyRows ?? []) {
    const workKey = `work|${row.date_key}`
    if (out[workKey]) continue
    const parsed = parseTasksJson(row.tasks)
    if (parsed) out[workKey] = parsed
  }

  return out
}
