import type { RealtimeEvent } from '../../src/core/api.ts'

export interface Subscriber {
  send(data: string): void
}

/** Pub/sub en memoria por proyecto (una sola instancia del servidor). */
export class Hub {
  private readonly subscribers = new Map<string, Set<Subscriber>>()

  subscribe(projectId: string, subscriber: Subscriber): () => void {
    let set = this.subscribers.get(projectId)
    if (!set) {
      set = new Set()
      this.subscribers.set(projectId, set)
    }
    set.add(subscriber)
    return () => {
      const current = this.subscribers.get(projectId)
      if (!current) return
      current.delete(subscriber)
      if (current.size === 0) this.subscribers.delete(projectId)
    }
  }

  publish(event: RealtimeEvent): void {
    const set = this.subscribers.get(event.projectId)
    if (!set) return
    const data = JSON.stringify(event)
    for (const s of set) {
      try {
        s.send(data)
      } catch {
        // Conexión cerrada: se limpia en su onClose.
      }
    }
  }

  count(projectId: string): number {
    return this.subscribers.get(projectId)?.size ?? 0
  }
}

export const hub = new Hub()
