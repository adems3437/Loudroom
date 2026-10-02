import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { memoryModule } from './server.js';

describe('memory import', () => {
  it('reads "emoji label" items', () => {
    const items =
      '🍎 Elma | 🍐 Armut | 🍌 Muz | 🍒 Kiraz | 🍇 Üzüm | 🍉 Karpuz | 🍓 Çilek | 🍋 Kırmızı limon';
    const result = importThrough(memoryModule, { başlık: 'Meyveler', öğeler: items });
    expect(result).toMatchObject({ ok: true });
    const content = (result as { content: { items: unknown[] } }).content;
    expect(content.items[0]).toEqual({ id: 'i1', label: 'Elma', emoji: '🍎' });
    expect(content.items[7]).toEqual({ id: 'i8', label: 'Kırmızı limon', emoji: '🍋' });
  });

  it('needs an emoji per item and enough items', () => {
    expect(importThrough(memoryModule, { baslik: 'X', ogeler: 'Elma | Armut' })).toMatchObject({
      ok: false,
    });
  });
});
