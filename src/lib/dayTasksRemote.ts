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
      tasks.push({
        id: String((item as Task).id),
        text: String((item as Task).text),
        completed: Boolean((item as Task).completed),
        ignored: Boolean((item as Task).ignored),
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

/** v2: corrige primeira abertura que saltava ontem → hoje; âncora null passa a fazer catch-up. */
function rollAnchorStorageKey(userId: string, agenda: 'work' | 'personal'): string {
  return `tododay.rollAnchor.v2.${userId}.${agenda}`
}

/** Quantos dias para trás tentar encadear na primeira sessão (sem âncora gravada). */
const ROLL_ANCHOR_FALLBACK_DAYS = 120

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

/**
 * Move pendentes do dia `fromDayKey` para o dia seguinte na nuvem (ordem: primeiro as roladas, depois o que já existia).
 * Idempotente: se a tarefa já existir no destino, remove-se só da origem.
 */
async function rollOneDayPairResult(
  sb: SupabaseClient,
  userId: string,
  agenda: 'work' | 'personal',
  fromDayKey: string,
  toDayKey: string,
): Promise<{ error: string | null; mutated: boolean }> {
  const fromStorage = toStorageDateKey(agenda, fromDayKey)
  const toStorage = toStorageDateKey(agenda, toDayKey)

  const fromRaw = await loadDayTasksFromCloud(sb, userId, fromStorage)
  const fromList = fromRaw ?? []

  const pending: Task[] = []
  for (const t of fromList) {
    if (!t.ignored && !t.completed && t.text.trim().length > 0) pending.push(t)
  }

  if (pending.length === 0) return { error: null, mutated: false }

  const toRaw = await loadDayTasksFromCloud(sb, userId, toStorage)
  const toList = toRaw && toRaw.length > 0 ? [...toRaw] : emptyDayTaskList()

  const toIds = new Set(toList.map((t) => t.id))
  const toAdd: Task[] = []
  for (const p of pending) {
    if (toIds.has(p.id)) continue
    toAdd.push(p)
    toIds.add(p.id)
  }

  const pendingIds = new Set(pending.map((p) => p.id))
  const newFrom = fromList.filter((t) => !pendingIds.has(t.id))
  const normalizedFrom = newFrom.length > 0 ? newFrom : emptyDayTaskList()
  const newTo = [...toAdd, ...toList]

  const errTo = await saveDayTasksToCloud(sb, userId, toStorage, newTo)
  if (errTo) return { error: errTo, mutated: false }

  const errFrom = await saveDayTasksToCloud(sb, userId, fromStorage, normalizedFrom)
  if (errFrom) return { error: errFrom, mutated: false }

  return { error: null, mutated: true }
}

/**
 * Encadeia rolls até hoje. Sem âncora: começa até 120 dias atrás (primeira sessão).
 * Se a âncora estiver já em `today` (bug antigo), ainda corre ontem → hoje (idempotente).
 */
export async function rollAgendaThroughToday(
  sb: SupabaseClient,
  userId: string,
  agenda: 'work' | 'personal',
  todayDayKey: string,
): Promise<boolean> {
  const lsKey = rollAnchorStorageKey(userId, agenda)
  const yesterday = addCalendarDay(todayDayKey, -1)
  let changed = false

  let cursor = localStorage.getItem(lsKey)
  if (!cursor) {
    cursor = addCalendarDay(todayDayKey, -ROLL_ANCHOR_FALLBACK_DAYS)
  }

  if (cursor >= todayDayKey) {
    const r = await rollOneDayPairResult(sb, userId, agenda, yesterday, todayDayKey)
    if (r.error) {
      console.error(r.error)
      return false
    }
    if (r.mutated) changed = true
    localStorage.setItem(lsKey, todayDayKey)
    return changed
  }

  while (cursor < todayDayKey) {
    const next = addCalendarDay(cursor, 1)
    const r = await rollOneDayPairResult(sb, userId, agenda, cursor, next)
    if (r.error) {
      console.error(r.error)
      break
    }
    if (r.mutated) changed = true
    cursor = next
    localStorage.setItem(lsKey, cursor)
  }

  const catchUp = await rollOneDayPairResult(sb, userId, agenda, yesterday, todayDayKey)
  if (catchUp.error) console.error(catchUp.error)
  else if (catchUp.mutated) changed = true

  if (cursor >= todayDayKey) {
    localStorage.setItem(lsKey, todayDayKey)
  }

  return changed
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
