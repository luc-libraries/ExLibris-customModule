/**
 * Parses Primo NDE's `?query=…` URL parameter.
 *
 * NDE serializes the query as a single URL parameter, in one of two forms:
 *
 *   Simple search   — `?query=tolstoy`
 *                     The bare terms; treated as a keyword search.
 *
 *   Advanced search — `?query=title,equals,Anna Karenina,AND;creator,contains,Tolstoy,AND;rtype,exact,books`
 *                     One or more `field,operator,terms,conjunction` clauses,
 *                     joined by `;`. Each clause's conjunction joins it to
 *                     the *next* clause, so the last clause's is unused.
 *
 * The presence of a comma in the decoded value is the signal that
 * distinguishes the two forms — Primo URL-encodes commas inside terms,
 * so a literal `,` in the value means we're in advanced mode.
 */

export interface PrimoClause {
  field: string;
  operator: string;
  terms: string;
  conjunction: string;
}

export type PrimoQuery =
  | { kind: 'simple'; terms: string }
  | { kind: 'advanced'; clauses: PrimoClause[] };

/** Parses a `window.location.search` string into a structured Primo query.
 *  Returns `null` when no `query` parameter is present. */
export function parsePrimoQuery(search: string): PrimoQuery | null {
  const raw = new URLSearchParams(search).get('query');
  if (!raw) return null;

  if (!raw.includes(',')) {
    return { kind: 'simple', terms: raw };
  }
  return { kind: 'advanced', clauses: raw.split(';').map(parseClause) };
}

// Parses a single `field,operator,terms,conjunction` segment.
// Missing fields default to empty strings (e.g. the last clause has
// no conjunction).
function parseClause(raw: string): PrimoClause {
  const [field = '', operator = '', terms = '', conjunction = ''] = raw.split(',');
  return { field, operator, terms, conjunction };
}

/** Converts spaces to `+` for URL-embedded search strings, the form Primo and most
 *  third-party search systems expect (vs `encodeURIComponent`'s `%20`). */
export function spaceToPlus(str: string): string {
  return str.replace(/\s+/g, '+');
}
