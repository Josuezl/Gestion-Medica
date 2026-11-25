import type { ComponentPropsWithoutRef } from 'react'

type Props = ComponentPropsWithoutRef<'svg'> & {
  size?: number
  strokeWidth?: number
}

export default function IconoMuela({ size = 24, strokeWidth = 2, ...props }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 5.5c-1.9 0-2.8-2.5-5.1-2.5C4.5 3 3 4.9 3 7.4c0 2.7 1.4 4.3 1.9 6.8C5.5 17 5.8 21 7.6 21c1.7 0 2-3.2 2.7-5.7.4-1.5.9-2.3 1.7-2.3s1.3.8 1.7 2.3c.7 2.5 1 5.7 2.7 5.7 1.8 0 2.1-4 2.7-6.8.5-2.5 1.9-4.1 1.9-6.8C21 4.9 19.5 3 17.1 3c-2.3 0-3.2 2.5-5.1 2.5Z" />
    </svg>
  )
}
