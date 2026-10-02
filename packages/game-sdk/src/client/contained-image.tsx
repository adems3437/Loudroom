'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { containedRect, toImagePoint, type ImagePoint, type Size } from './contained-rect.js';

/**
 * An image fitted into its box (`object-fit: contain`) with an overlay exactly over the drawn
 * image: children are positioned in percent of the image (`left: x * 100%`), so pins land on
 * the same spot on the TV, the phones and in the admin editor whatever the box size.
 */
export function ContainedImage({
  src,
  alt,
  natural,
  onPick,
  onNaturalSize,
  children,
  className = '',
  testId,
}: {
  src: string;
  alt: string;
  /** The image's natural size; when unknown it is read once the image has loaded. */
  natural?: Size | null;
  /** Called with the image point under a tap or click (not on the empty bands). */
  onPick?: (point: ImagePoint) => void;
  /** Called with the natural size once the image has loaded. */
  onNaturalSize?: (size: Size) => void;
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const [box, setBox] = useState<Size | null>(null);
  const [loaded, setLoaded] = useState<Size | null>(null);
  const size = natural ?? loaded;

  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const rect = size && box ? containedRect(size, box) : null;

  return (
    <div
      ref={measure}
      data-testid={testId}
      className={`relative overflow-hidden ${onPick ? 'cursor-crosshair touch-manipulation' : ''} ${className}`}
      onClick={(event) => {
        if (!onPick || !size) return;
        // Screen units on both sides, so a CSS-scaled stage (host) maps correctly too.
        const bounds = event.currentTarget.getBoundingClientRect();
        const image = containedRect(size, { width: bounds.width, height: bounds.height });
        const point = toImagePoint(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          image,
        );
        if (point) onPick(point);
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain select-none"
        onLoad={(event) => {
          const image = event.currentTarget;
          const size = { width: image.naturalWidth, height: image.naturalHeight };
          setLoaded(size);
          onNaturalSize?.(size);
        }}
      />
      {rect && (
        <div
          className="pointer-events-none absolute"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
