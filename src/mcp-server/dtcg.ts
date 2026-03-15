/**
 * W3C DTCG (Design Token Community Group) format parser.
 *
 * Parses DTCG JSON into flat DesignToken[] with resolved aliases.
 * Only runs on MCP Server side (not in Plugin).
 */

import type { DesignToken, DtcgType } from '../shared/types.js';

interface DtcgGroup {
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DtcgTokenDef {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

/** Parse a DTCG JSON object into flat DesignToken[]. */
export function parseDtcg(root: Record<string, unknown>): DesignToken[] {
  const tokens: DesignToken[] = [];
  const tokenMap = new Map<string, DesignToken>();

  // Phase 1: collect all tokens
  walkGroup(root, [], undefined, tokens);

  // Phase 2: resolve aliases
  for (const token of tokens) {
    tokenMap.set(token.path, token);
  }

  for (const token of tokens) {
    token.value = resolveAliases(token.value, tokenMap);
  }

  return tokens;
}

function walkGroup(
  obj: Record<string, unknown>,
  pathParts: string[],
  inheritedType: string | undefined,
  tokens: DesignToken[],
): void {
  const groupType = (obj.$type as string) ?? inheritedType;

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue; // skip meta keys

    if (isTokenDef(value)) {
      const tokenType = (value.$type ?? groupType) as DtcgType;
      tokens.push({
        path: [...pathParts, key].join('.'),
        type: tokenType,
        value: value.$value,
        description: value.$description,
        extensions: value.$extensions,
      });
    } else if (typeof value === 'object' && value !== null) {
      walkGroup(
        value as Record<string, unknown>,
        [...pathParts, key],
        groupType,
        tokens,
      );
    }
  }
}

function isTokenDef(value: unknown): value is DtcgTokenDef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$value' in (value as Record<string, unknown>)
  );
}

/** Resolve {alias.path} references recursively. */
function resolveAliases(
  value: unknown,
  tokenMap: Map<string, DesignToken>,
  visited = new Set<string>(),
): unknown {
  if (typeof value === 'string') {
    const aliasMatch = value.match(/^\{(.+)\}$/);
    if (aliasMatch) {
      const refPath = aliasMatch[1];
      if (visited.has(refPath)) {
        return value; // circular reference — return as-is
      }
      const ref = tokenMap.get(refPath);
      if (ref) {
        visited.add(refPath);
        return resolveAliases(ref.value, tokenMap, visited);
      }
    }
    return value;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      resolved[k] = resolveAliases(v, tokenMap, new Set(visited));
    }
    return resolved;
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveAliases(v, tokenMap, new Set(visited)));
  }

  return value;
}

/** Read and parse a DTCG JSON file from disk. */
export async function parseDtcgFile(filePath: string): Promise<DesignToken[]> {
  const { readFile } = await import('fs/promises');
  const content = await readFile(filePath, 'utf-8');
  const json = JSON.parse(content);
  return parseDtcg(json);
}
