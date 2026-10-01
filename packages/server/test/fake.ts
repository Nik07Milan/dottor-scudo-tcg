// Dipendenze finte per GameSession: orologio controllato dal test, messaggi raccolti per sessione.
import type { SessionDeps } from "../src/session";

export interface Sent {
  to: string;
  type: string;
  payload: any;
}

export function fakeDeps(randomValues: number[] = []) {
  let now = 1_000_000;
  let nextTimer = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sent: Sent[] = [];
  const random = [...randomValues];

  const deps: SessionDeps = {
    send: (to, type, payload) => sent.push({ to, type, payload: structuredClone(payload) }),
    schedule: (ms, fn) => {
      const id = nextTimer++;
      timers.set(id, { at: now + ms, fn });
      return () => timers.delete(id);
    },
    now: () => now,
    random: () => (random.length > 0 ? random.shift()! : 0.5),
  };

  return {
    deps,
    sent,
    /** Fa avanzare l'orologio ed esegue i timer scaduti, in ordine. */
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    pendingTimers: () => timers.size,
    /** Ultimo messaggio di un tipo per una sessione. */
    last(to: string, type: string) {
      return [...sent].reverse().find((m) => m.to === to && m.type === type)?.payload;
    },
    clear: () => sent.splice(0),
  };
}
