/**
 * Centralized brand/feature terms that should never be translated.
 * Expand this list as new branded surfaces are introduced.
 */
export const DEFAULT_PROTECTED_TERMS = [
  'Obsy',
  'Obsy+',
  'Obsy Plus',
  'Moodverse',
  'Year in Pixels',
  'Tag Reflections',
  'Object Stories',
  'Data Trust Foundation',
  'Vanguard',
] as const;

const TOKEN_PREFIX = '__OBSY_PROTECTED_TERM_';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function protectTerms(text: string, protectedTerms: readonly string[]) {
  const tokenToTerm = new Map<string, string>();
  let output = text;

  protectedTerms.forEach((term, index) => {
    const token = `${TOKEN_PREFIX}${index}__`;
    const pattern = new RegExp(escapeRegExp(term), 'g');
    output = output.replace(pattern, token);
    tokenToTerm.set(token, term);
  });

  return { output, tokenToTerm };
}

export function restoreProtectedTerms(text: string, tokenToTerm: Map<string, string>) {
  let output = text;

  tokenToTerm.forEach((term, token) => {
    output = output.replaceAll(token, term);
  });

  return output;
}
