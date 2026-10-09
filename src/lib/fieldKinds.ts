// Location: src/lib/fieldKinds.ts
// One place that decides keyboard type / capitalisation / autocorrect for every text field, so the same kind of data
// always gets the same keyboard. Pure data; unit-tested. Explicit props on a <Field> still override these.
export type FieldKind = 'text' | 'name' | 'email' | 'phone' | 'url' | 'integer' | 'decimal' | 'money' | 'pin' | 'secret' | 'code' | 'search' | 'date' | 'json';

export type KindProps = {
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean; spellCheck?: boolean; secureTextEntry?: boolean; returnKeyType?: 'done' | 'search' | 'next' | 'go';
  clearButtonMode?: 'while-editing'; multiline?: boolean;
};
const NO_FUSS = { autoCapitalize: 'none', autoCorrect: false, spellCheck: false } as const;

export const KIND_PROPS: Record<FieldKind, KindProps> = {
  text: { autoCapitalize: 'sentences' },
  name: { autoCapitalize: 'words', autoCorrect: false, returnKeyType: 'done' },
  email: { ...NO_FUSS, keyboardType: 'email-address', returnKeyType: 'done' },
  phone: { ...NO_FUSS, keyboardType: 'phone-pad' },
  url: { ...NO_FUSS, keyboardType: 'url', returnKeyType: 'go' },
  integer: { ...NO_FUSS, keyboardType: 'number-pad' },
  decimal: { ...NO_FUSS, keyboardType: 'decimal-pad' },
  money: { ...NO_FUSS, keyboardType: 'decimal-pad' },
  pin: { ...NO_FUSS, keyboardType: 'number-pad', secureTextEntry: true },
  secret: { ...NO_FUSS, secureTextEntry: true, returnKeyType: 'done' },
  code: { ...NO_FUSS, returnKeyType: 'done' },
  search: { ...NO_FUSS, returnKeyType: 'search', clearButtonMode: 'while-editing' },
  date: { ...NO_FUSS, keyboardType: 'numbers-and-punctuation' },
  json: { ...NO_FUSS, multiline: true },
};
/** iOS number/decimal/phone pads have no Return key, so we attach a "Done" bar to them. */
export const needsDoneBar = (k: FieldKind | undefined, keyboardType?: string): boolean => {
  const t = keyboardType ?? (k ? KIND_PROPS[k].keyboardType : undefined);
  return t === 'number-pad' || t === 'decimal-pad' || t === 'phone-pad';
};
