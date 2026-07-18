// Teammate B — shared dependency shape for my four services.
//
// Every service is a factory that takes these deps and returns a `start()` that wires up its
// bus subscriptions. Dependency injection = I code against the frozen `EventBus`/`Store`
// interfaces (Teammate A) and `PomeriumGuard` (Teammate C) without importing their concrete
// files, so I am never blocked and never cause a merge conflict in their lane.

import type { EventBus, Store, PomeriumGuard } from "../contract";
import type { LocalNexla } from "../nexla";

export interface ServiceDeps {
  bus: EventBus;
  store: Store;
  nexla: LocalNexla;
  /** Optional — Teammate C's guard. If present, writes go through it; if not, we proceed. */
  guard?: PomeriumGuard;
}

export interface Service {
  /** Subscribe to trigger events. Idempotent-ish: call once at boot. */
  start(): void;
}
