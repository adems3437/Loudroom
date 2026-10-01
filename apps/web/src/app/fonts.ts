import { Bricolage_Grotesque, Inter } from 'next/font/google';

// latin-ext carries the Turkish letters (ğ, ş, ı, İ, ç, ö, ü).
export const bodyFont = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-body',
  display: 'swap',
});

export const headingFont = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-heading',
  display: 'swap',
});
