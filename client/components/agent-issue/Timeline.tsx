import { ReactNode } from "react";
import { GitCommitIcon, GitCompareIcon } from "@/components/agent-issue/icons";

export function Avatar({
  src,
  alt,
  size = 40,
  rounded = "full",
}: {
  src: string;
  alt: string;
  size?: number;
  rounded?: "full" | "md";
}) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: size, height: size }}
      className={
        "flex-shrink-0 shadow-[0_0_0_1px_rgba(31,35,40,0.15)] " +
        (rounded === "full" ? "rounded-full" : "rounded-md")
      }
    />
  );
}

export function TimelineItem({
  avatar,
  children,
  isLast = false,
}: {
  avatar: ReactNode;
  children: ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <div className="flex h-full flex-col items-center self-stretch">
        <div className="relative z-10">{avatar}</div>
        {!isLast && (
          <div className="mt-2 w-0.5 flex-1 bg-gh-borderMuted" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-8">{children}</div>
    </div>
  );
}

export function ActivityRow({
  author,
  action,
  commitLabel,
  commitHash,
}: {
  author: string;
  action: string;
  commitLabel: string;
  commitHash: string;
}) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-white bg-gh-canvasInset">
          <GitCommitIcon className="h-4 w-4" />
        </span>
        <p className="text-sm">
          <span className="font-semibold text-gh-fg">{author}</span>{" "}
          <span className="text-gh-fgMuted">{action}</span>
        </p>
      </div>
      <div className="flex items-center gap-3 pl-11">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-white bg-gh-canvasInset">
          <GitCompareIcon className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 font-mono text-xs text-gh-fgMuted">
          <span className="truncate underline">{commitLabel}</span>
          <span className="underline">{commitHash}</span>
        </div>
      </div>
    </div>
  );
}
