import { getRequestConfig } from 'next-intl/server';
import type messages from '../../messages/tr.json';
import { defaultLocale } from './config';

// No locale in the URL: everything is Turkish for now. Adding English means adding
// messages/en.json, the locale to config.ts and a way to pick it (cookie or header).
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  const loaded = (await import(`../../messages/${locale}.json`)) as { default: typeof messages };
  return { locale, messages: loaded.default };
});
