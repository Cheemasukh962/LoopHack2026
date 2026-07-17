import { ReactNode } from "react";
import { CheckIcon, KebabIcon, ReactionSmileyIcon } from "@/components/agent-issue/icons";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gh-border px-2 py-0.5 text-xs font-medium text-gh-fgMuted">
      {children}
    </span>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-[rgba(129,139,152,0.12)] px-1.5 py-0.5 font-mono text-[12px] text-gh-fg">
      {children}
    </code>
  );
}

export function ChecklistItem({
  label,
  checked = true,
}: {
  label: string;
  checked?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className={
          "flex h-[13px] w-[13px] flex-shrink-0 items-center justify-center rounded-sm border " +
          (checked
            ? "border-[#D1D1D1] bg-[#D1D1D1]"
            : "border-[#D1D1D1] bg-[#F8F8F8]")
        }
      >
        {checked && <CheckIcon className="h-[9px] w-[9px]" />}
      </span>
      <span className="text-sm text-gh-fg">{label}</span>
    </div>
  );
}

export function CommentCard({
  author,
  action,
  badges,
  headerRight,
  children,
  showReaction = false,
}: {
  author: string;
  action: string;
  badges?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  showReaction?: boolean;
}) {
  return (
    <div className="w-full overflow-hidden rounded-md border border-gh-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gh-border bg-gh-canvasInset px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="font-semibold text-gh-fg">{author}</span>
            {badges}
          </span>
          <span className="text-gh-fgMuted">{action}</span>
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          <button
            type="button"
            aria-label="Show options"
            className="rounded-md p-1.5 hover:bg-black/5"
          >
            <KebabIcon />
          </button>
        </div>
      </div>
      <div className="px-4 py-2">{children}</div>
      {showReaction && (
        <div className="flex items-center px-4 pb-4">
          <button
            type="button"
            aria-label="Add or remove reactions"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-gh-borderMuted bg-gh-canvasInset hover:bg-gh-border"
          >
            <ReactionSmileyIcon />
          </button>
        </div>
      )}
    </div>
  );
}
