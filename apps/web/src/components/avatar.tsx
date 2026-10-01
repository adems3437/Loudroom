import type { AvatarId } from '@loudroom/shared';
import type { ReactNode } from 'react';

/**
 * Our own avatar set (SPEC §12: no copyrighted characters): simple shapes with a face, filled
 * with the player's color. Drawn on a 100×100 grid.
 */
const BODIES: Record<AvatarId, { body: ReactNode; face: { x: number; y: number; scale: number } }> =
  {
    circle: { body: <circle cx="50" cy="50" r="42" />, face: { x: 50, y: 52, scale: 1 } },
    square: {
      body: <rect x="10" y="10" width="80" height="80" rx="18" />,
      face: { x: 50, y: 52, scale: 1 },
    },
    triangle: {
      body: <path d="M50 8 Q54 8 57 13 L93 82 Q96 92 86 92 H14 Q4 92 7 82 L43 13 Q46 8 50 8 Z" />,
      face: { x: 50, y: 66, scale: 0.8 },
    },
    hexagon: {
      body: <path d="M50 6 L89 28 V72 L50 94 L11 72 V28 Z" strokeLinejoin="round" />,
      face: { x: 50, y: 52, scale: 1 },
    },
    star: {
      body: (
        <path
          d="M50 5 L62 35 L95 37 L69 58 L78 91 L50 73 L22 91 L31 58 L5 37 L38 35 Z"
          strokeLinejoin="round"
        />
      ),
      face: { x: 50, y: 54, scale: 0.72 },
    },
    drop: {
      body: <path d="M50 6 C50 6 86 44 86 62 A36 36 0 0 1 14 62 C14 44 50 6 50 6 Z" />,
      face: { x: 50, y: 64, scale: 0.9 },
    },
    cloud: {
      body: <path d="M26 82 A20 20 0 0 1 22 43 A26 26 0 0 1 71 33 A22 22 0 0 1 76 82 Z" />,
      face: { x: 50, y: 60, scale: 0.9 },
    },
    diamond: {
      body: <path d="M50 4 L96 50 L50 96 L4 50 Z" strokeLinejoin="round" />,
      face: { x: 50, y: 52, scale: 0.85 },
    },
    pill: {
      body: <rect x="6" y="22" width="88" height="56" rx="28" />,
      face: { x: 50, y: 52, scale: 0.9 },
    },
    flower: {
      body: (
        <g>
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <circle
              key={angle}
              cx={50 + 26 * Math.cos((angle * Math.PI) / 180)}
              cy={50 + 26 * Math.sin((angle * Math.PI) / 180)}
              r="20"
            />
          ))}
          <circle cx="50" cy="50" r="30" />
        </g>
      ),
      face: { x: 50, y: 52, scale: 0.85 },
    },
    ghost: {
      body: <path d="M14 92 V46 A36 36 0 0 1 86 46 V92 L74 82 L62 92 L50 82 L38 92 L26 82 Z" />,
      face: { x: 50, y: 50, scale: 1 },
    },
    moon: {
      body: <path d="M64 6 A44 44 0 1 0 94 74 A36 36 0 1 1 64 6 Z" />,
      face: { x: 30, y: 54, scale: 0.68 },
    },
  };

const INK = '#14142a';

function Face({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="-13" cy="-6" r="9" fill="#fff" />
      <circle cx="13" cy="-6" r="9" fill="#fff" />
      <circle cx="-11" cy="-5" r="4.5" fill={INK} />
      <circle cx="15" cy="-5" r="4.5" fill={INK} />
      <path
        d="M-10 10 Q0 19 10 10"
        fill="none"
        stroke={INK}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </g>
  );
}

export function Avatar({
  id,
  color,
  size,
  className = '',
}: {
  id: AvatarId;
  color: string;
  size: number;
  className?: string;
}) {
  const { body, face } = BODIES[id];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <g fill={color} stroke={color} strokeWidth="2">
        {body}
      </g>
      <Face {...face} />
    </svg>
  );
}
