'use client';

import QRCode from 'qrcode';
import { useMemo } from 'react';

const QUIET_ZONE = 4;

/**
 * QR code drawn as one SVG path from the module matrix — no generated markup is injected into
 * the page (dangerouslySetInnerHTML is forbidden, SPEC §9).
 */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const { path, dimension } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    let d = '';
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { path: d, dimension: modules.size + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg
      data-testid="qr-code"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${dimension} ${dimension}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-2xl"
    >
      <rect width={dimension} height={dimension} fill="#fff" />
      <path d={path} fill="#0a0a12" />
    </svg>
  );
}
