import { mediaUrl } from '@loudroom/game-sdk/client';
import type { ItemView } from './schema.js';

/** An object: its image or emoji, with the label under it (emoji look differ by device). */
export function ItemCard({ item, size }: { item: ItemView; size: number }) {
  return (
    <span className="flex flex-col items-center gap-1">
      {item.mediaId ? (
        <img
          src={mediaUrl(item.mediaId)}
          alt=""
          className="rounded-2xl object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span aria-hidden className="leading-none" style={{ fontSize: size * 0.8 }}>
          {item.emoji}
        </span>
      )}
      <span className="font-semibold" style={{ fontSize: Math.max(14, size * 0.22) }}>
        {item.label}
      </span>
    </span>
  );
}
