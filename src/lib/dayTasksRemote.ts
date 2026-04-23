import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '../types/task'

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
      })
    }
  }
  return tasks.length ? tasks : null
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
  if (!data || data.tasks == null) return null
  return parseTasksJson(data.tasks)
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
  return error ? error.message : null
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
  return out
}
