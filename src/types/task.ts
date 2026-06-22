export type Task = {
  id: string
  text: string
  /** Explicação ou notas longas (opcional); visível no painel de detalhe. */
  detail?: string
  completed: boolean
  /** Não apaga o texto: tarefa anulada / já não fazer (sai das pendentes). */
  ignored?: boolean
  /** Cópia criada pelo roll: id da tarefa pendente no dia `rolledFromDayKey`. */
  rolledFromId?: string
  rolledFromDayKey?: string
}
