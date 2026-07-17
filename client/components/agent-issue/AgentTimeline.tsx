import type { ReactNode } from "react";

/** One contextual agent action on the timeline. `event` ties to the Keeper contract. */
export interface AgentAction {
  id: string;
  text: ReactNode;
  detail?: string; // monospace secondary line, e.g. a path or commit hash
  event?: string; // Keeper EventType this action corresponds to
  state?: "done" | "active";
}

/**
 * A timeline of contextual agent actions, inset to sit under the comment cards
 * (aligned with the card's left edge, past the avatar gutter) rather than at the
 * page margin. Renders as a compact left rail with dots.
 */
export function AgentTimeline({ entries }: { entries: AgentAction[] }) {
  if (!entries.length) return null;
  return (
    <div className="pl-[52px] sm:pl-14">
      <div className="border-l border-gh-borderMuted pl-5">
        {entries.map((entry) => {
          const active = entry.state === "active";
          return (
            <div key={entry.id} className="relative pb-3 last:pb-0">
              <span
                className={
                  "absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white " +
                  (active ? "bg-[#1F883D]" : "bg-gh-borderMuted")
                }
              >
                {active && (
                  <span className="absolute inline-flex h-3.5 w-3.5 animate-ping rounded-full bg-[#1F883D] opacity-60" />
                )}
                <span className="h-1 w-1 rounded-full bg-white" />
              </span>
              <p className={"text-sm " + (active ? "text-gh-fg" : "text-gh-fgMuted")}>{entry.text}</p>
              {entry.detail && (
                <div className="mt-0.5 truncate font-mono text-xs text-gh-fgMuted">{entry.detail}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
