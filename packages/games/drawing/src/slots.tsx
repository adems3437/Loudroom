/** Empty letter boxes, one row per word ("buz dolabı" → □□□ □□□□□□). */
export function LetterSlots({ slots, size }: { slots: readonly number[]; size: number }) {
  return (
    <span className="flex flex-wrap gap-x-6 gap-y-2" data-testid="drawing-slots">
      {slots.map((letters, word) => (
        <span key={word} className="flex gap-1.5">
          {Array.from({ length: letters }, (_, index) => (
            <span
              key={index}
              className="border-muted block rounded-sm border-b-4"
              style={{ width: size, height: size * 1.1 }}
            />
          ))}
        </span>
      ))}
    </span>
  );
}
