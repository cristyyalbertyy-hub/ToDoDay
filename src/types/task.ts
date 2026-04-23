export type Task = {
  id: string
  text: string
  completed: boolean
  /** Não apaga o texto: tarefa anulada / já não fazer (sai das pendentes). */
  ignored?: boolean
}
