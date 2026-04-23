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

/** Tarefas por fazer (não ignoradas) em todos os dias anteriores a `todayDayKey` na nuvem. */
export async function countPastPendingInCloud(
  sb: SupabaseClient,
  userId: string,
  agenda: 'work' | 'personal',
  todayDayKey: string,
): Promise<number> {
  const prefix = `${agenda}|`
  const { data: rows, error } = await sb
    .from('day_tasks')
    .select('tasks')
    .eq('user_id', userId)
    .gte('date_key', `${prefix}2000-01-01`)
    .lt('date_key', `${prefix}${todayDayKey}`)

  if (error) {
    console.error(error)
    return 0
  }

  let total = 0
  for (const row of rows ?? []) {
    const parsed = parseTasksJson(row.tasks)
    if (parsed) total += countActivePendingInTaskList(parsed)
  }

  if (agenda === 'work') {
    const { data: legacy, error: legErr } = await sb
      .from('day_tasks')
      .select('tasks')
      .eq('user_id', userId)
      .lt('date_key', todayDayKey)
      .not('date_key', 'like', '%|%')

    if (legErr) {
      console.error(legErr)
      return total
    }
    for (const row of legacy ?? []) {
      const parsed = parseTasksJson(row.tasks)
      if (parsed) total += countActivePendingInTaskList(parsed)
    }
  }

  return total
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
