import type { ReactNode } from 'react';
import type { ImagePointValue, ImageView } from './schema.js';

/** Places a mark centered on an image point (inside a ContainedImage overlay). */
export function At({
  point,
  children,
  testId,
  anchor = 'center',
}: {
  point: ImagePointValue;
  children: ReactNode;
  testId?: string;
  /** `bottom`: the mark stands on the point, like a pin. */
  anchor?: 'center' | 'bottom';
}) {
  return (
    <span
      data-testid={testId}
      className={`absolute flex -translate-x-1/2 flex-col items-center ${
        anchor === 'bottom' ? '-translate-y-full' : '-translate-y-1/2'
      }`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
    >
      {children}
    </span>
  );
}

/** The full-score area: a circle on screen, so an ellipse in image percentages. */
export function TargetRing({
  target,
  radius,
  image,
  dashed = false,
}: {
  target: ImagePointValue;
  radius: number;
  image: Pick<ImageView, 'width' | 'height'>;
  dashed?: boolean;
}) {
  const longer = Math.max(image.width, image.height);
  const width = ((2 * radius * longer) / image.width) * 100;
  const height = ((2 * radius * longer) / image.height) * 100;
  return (
    <span
      className={`border-success bg-success/20 absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 ${
        dashed ? 'border-dashed' : ''
      }`}
      style={{
        left: `${target.x * 100}%`,
        top: `${target.y * 100}%`,
        width: `${width}%`,
        height: `${height}%`,
      }}
    />
  );
}

/** The target: a bright dot with a dark edge, visible on any image. */
export function TargetDot({ size }: { size: number }) {
  return (
    <span
      className="bg-success border-canvas block rounded-full border-4 shadow-lg"
      style={{ width: size, height: size }}
    />
  );
}
