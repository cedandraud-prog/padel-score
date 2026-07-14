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

export function TeamIcon({ className }: IconProps) {
  return (
    <svg {...iconProps} className={className} fill="currentColor" stroke="none">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2.5 19c.4-4.1 2.1-6.2 5.5-6.2s5.1 2.1 5.5 6.2H2.5Z" />
      <path d="M10.5 19c.4-4.1 2.1-6.2 5.5-6.2s5.1 2.1 5.5 6.2H10.5Z" />
    </svg>
  )
}

export function PlayerIcon({ className }: IconProps) {
  return (
    <svg {...iconProps} className={className} fill="currentColor" stroke="none">
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21c.4-5.2 2.6-8 7-8s6.6 2.8 7 8H5Z" />
    </svg>
  )
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...iconProps} className={className} fill="currentColor" stroke="none">
      <path d="M7 4.8c0-1.3 1.4-2.1 2.5-1.4l9.3 5.8c1 .6 1 2 0 2.6l-9.3 5.8C8.4 18.3 7 17.5 7 16.2V4.8Z" />
    </svg>
  )
}
