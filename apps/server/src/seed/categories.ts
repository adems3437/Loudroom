import type { PrismaClient } from '../generated/prisma/client.js';

export const SEED_CATEGORIES = [
  { slug: 'genel-kultur', name: 'Genel Kültür' },
  { slug: 'tarih', name: 'Tarih' },
  { slug: 'cografya', name: 'Coğrafya' },
  { slug: 'bilim-teknoloji', name: 'Bilim ve Teknoloji' },
  { slug: 'spor', name: 'Spor' },
  { slug: 'sanat-edebiyat', name: 'Sanat ve Edebiyat' },
  { slug: 'film-dizi-muzik', name: 'Film, Dizi ve Müzik' },
] as const;

/** Idempotent: categories are matched by slug, so running the seed again changes nothing. */
export async function seedCategories(prisma: PrismaClient): Promise<void> {
  for (const category of SEED_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
  }
}
