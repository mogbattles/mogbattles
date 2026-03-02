import * as React from "react"

// ─── Inline arrow icons (same as Remix Icon arrows) ─────────────────────────

function ArrowUpFill({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 8l6 8H6z" />
    </svg>
  )
}

function ArrowDownFill({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 16l-6-8h12z" />
    </svg>
  )
}

// ─── Badge Delta ─────────────────────────────────────────────────────────────

type DeltaType = "increase" | "decrease" | "neutral"
type Variant = "outline" | "solid"

interface BadgeDeltaProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: string | number
  deltaType?: DeltaType
  variant?: Variant
}

const variantStyles: Record<Variant, Record<DeltaType, string>> = {
  outline: {
    increase: "text-emerald-500 ring-1 ring-inset ring-emerald-500/20",
    decrease: "text-red-500 ring-1 ring-inset ring-red-500/20",
    neutral: "text-gray-400 ring-1 ring-inset ring-gray-500/20",
  },
  solid: {
    increase: "bg-emerald-400/20 text-emerald-500",
    decrease: "bg-red-400/20 text-red-500",
    neutral: "bg-gray-500/30 text-gray-300",
  },
}

export function BadgeDelta({
  className = "",
  variant = "outline",
  deltaType = "neutral",
  value,
  ...props
}: BadgeDeltaProps) {
  const Icon = deltaType === "increase" ? ArrowUpFill : deltaType === "decrease" ? ArrowDownFill : null

  return (
    <span
      className={`inline-flex items-center gap-x-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${variantStyles[variant][deltaType]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="-ml-0.5 size-3" />}
      {value}
    </span>
  )
}
