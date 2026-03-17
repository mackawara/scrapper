function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFuzzyTokenPattern(token: string): string {
  return token
    .split("")
    .map((char) => escapeRegExp(char))
    .join("[\\s\\W_]*");
}

export function buildLooseRegexFromQuery(query: string): string {
  const clean = query.trim();
  if (!clean) return ".*";

  const tokens = clean.match(/[a-z0-9]+/gi) ?? [];
  if (tokens.length === 0) {
    return escapeRegExp(clean);
  }

  if (tokens.length === 1) {
    return buildFuzzyTokenPattern(tokens[0]);
  }

  const lookaheads = tokens
    .map((token) => `(?=.*${buildFuzzyTokenPattern(token)})`)
    .join("");
  return `${lookaheads}.*`;
}

export function createWishlistRegex(query: string, regexPattern?: string): RegExp {
  const source = regexPattern?.trim() ? regexPattern.trim() : buildLooseRegexFromQuery(query);
  return new RegExp(source, "i");
}
