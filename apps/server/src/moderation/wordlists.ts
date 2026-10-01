/**
 * Built-in blocked words (SPEC §9). Extend at deploy time with PROFANITY_EXTRA_WORDS_FILE.
 *
 * Matching (see ProfanityFilter): text is Turkish-lower-cased, leetspeak and Turkish letters are
 * folded (ş→s, 4→a, …) and repeated letters collapsed. Words of 4+ letters then match anywhere
 * in the text; shorter words, and words prefixed with "=", only match as a whole word (also when
 * spelled apart, "a.m.k") so that innocent names containing them ("Hancock") are not blocked.
 * "amına" is deliberately absent: it folds to the common name "Amina".
 */
export const TURKISH_WORDS = [
  '=amk',
  '=aq',
  'aminakoy',
  'amcik',
  'orospu',
  '=oc',
  '=pic',
  '=sik',
  '=sikim',
  'siktir',
  'sikerim',
  'yarrak',
  'dalyarak',
  '=got',
  'gotveren',
  'ibne',
  'ipne',
  'kahpe',
  'kaltak',
  'pezevenk',
  'gavat',
  '=pust',
  'serefsiz',
  'yavsak',
  '=anani',
  'ananisikim',
  'gerizekali',
] as const;

export const ENGLISH_WORDS = [
  'fuck',
  'shit',
  'bitch',
  '=cunt',
  '=dick',
  '=cock',
  'pussy',
  'whore',
  '=slut',
  'asshole',
  'bastard',
  'nigger',
  'nigga',
  'faggot',
  '=fag',
  'retard',
  '=twat',
  'wanker',
  '=rape',
  '=nazi',
  'hitler',
] as const;
