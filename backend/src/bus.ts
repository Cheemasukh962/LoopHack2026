import type { BusEvent, EventBus, EventType } from "./contract/index.js";

type EventHandler = (event: BusEvent) => void | Promise<void>;

/** In-process event bus used to show the autonomous loop during the demo. */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventType, Set<EventHandler>>();

  publish(event: BusEvent): void {
    queueMicrotask(() => {
      const handlers = [...(this.handlers.get(event.type) ?? [])];
      console.info(`[bus] ${event.type}`, event.issue_id ?? event.payload.issue_id ?? "");
      for (const handler of handlers) {
        void Promise.resolve()
          .then(() => handler(event))
          .catch((error: unknown) => console.error(`[bus] subscriber failed for ${event.type}`, error));
      }
    });
  }

  subscribe(type: EventType, handler: EventHandler): void {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.handlers.set(type, handlers);
  }
}
