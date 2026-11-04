import type { BackgroundTasks } from "../application/ports";

/**
 * Lanza la tarea sin esperarla. Lleva la cuenta de las tareas en curso para que,
 * al apagar el servidor, se pueda esperar a que terminen (cierre ordenado).
 *
 * Límite consciente del MVP: si el proceso muere a mitad de una tarea, esta se pierde.
 * GetGenerationJob la marca como fallida pasados unos minutos y devuelve la cuota.
 * Cuando haga falta más robustez, esto se sustituye por una cola (BullMQ, pg-boss…)
 * sin tocar los casos de uso, porque solo dependen de la interfaz BackgroundTasks.
 */
export class InProcessBackgroundTasks implements BackgroundTasks {
  private readonly running = new Set<Promise<void>>();

  run(task: () => Promise<void>): void {
    const promise = task()
      .catch((error: unknown) => console.error("[background] tarea fallida", error))
      .finally(() => this.running.delete(promise));
    this.running.add(promise);
  }

  /** Espera a que terminen las tareas en curso, como máximo `timeoutMs`. */
  async drain(timeoutMs = 25_000): Promise<void> {
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref());
    await Promise.race([Promise.allSettled([...this.running]), timeout]);
  }
}
