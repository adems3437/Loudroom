import { importThrough } from '@loudroom/game-sdk/testing';
import { describe, expect, it } from 'vitest';
import { spyModule } from './server.js';

const places =
  '🏥 Hastane | 🏫 Okul | Havalimanı | 🍽️ Restoran | 🎬 Sinema | 🏖️ Plaj | 🛒 Market | 🏦 Banka';

describe('spy import', () => {
  it('reads the title and the places, with or without an emoji', () => {
    const result = importThrough(spyModule, { Başlık: 'Şehir', Mekânlar: places });
    expect(result).toMatchObject({ ok: true, content: { title: 'Şehir' } });
    if (!result.ok) return;
    const content = result.content as { locations: unknown[] };
    expect(content.locations).toHaveLength(8);
    expect(content.locations[0]).toEqual({ id: 'l1', name: 'Hastane', emoji: '🏥' });
    expect(content.locations[2]).toEqual({ id: 'l3', name: 'Havalimanı' });
  });

  it('points at the places column when there are too few', () => {
    expect(importThrough(spyModule, { baslik: 'Şehir', mekanlar: 'Okul | Plaj' })).toEqual({
      ok: false,
      columns: ['mekanlar'],
    });
  });
});
