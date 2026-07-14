interface IconProps {
  className?: string
}

const iconProps = {
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.8 6.2 4 4" />
    </svg>
  )
}

export function MicrophoneIcon({ className }: IconProps) {
  return (
    <svg {...iconProps} className={className}>
      <rect x="8" y="3" width="8" height="12" rx="4" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    </svg>
  )
}

export function SwapIcon({ className }: IconProps) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </svg>
  )
}

export function ArrowLeftRightIcon({ className }: IconProps) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M8 7h11m0 0-3-3m3 3-3 3M16 17H5m0 0 3 3m-3-3 3-3" />
    </svg>
  )
}
