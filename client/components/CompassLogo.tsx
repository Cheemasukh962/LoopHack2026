import { Compass } from "lucide-react";

/** The Compass app mark: a white Lucide compass on a near-black background. */
export function CompassLogo({
  size = 40,
  rounded = "md",
}: {
  size?: number;
  rounded?: "full" | "md";
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={
        "flex flex-shrink-0 items-center justify-center bg-gh-fg text-white " +
        (rounded === "full" ? "rounded-full" : "rounded-md")
      }
    >
      <Compass style={{ width: size * 0.58, height: size * 0.58 }} strokeWidth={2} />
    </span>
  );
}
