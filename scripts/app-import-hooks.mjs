/**
 * Module resolution hooks that let a plain `node` script import app code.
 *
 * Two things Next.js does for us that bare node does not:
 *   - the `@/…` path alias from tsconfig.json
 *   - extensionless relative imports (`./types` → `./types.ts`)
 *
 * Registered by scripts/register-app-imports.mjs. Type stripping itself comes
 * from node's --experimental-transform-types.
 */

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const projectRoot = pathToFileURL(new URL("../", import.meta.url).pathname);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(new URL(`${specifier.slice(2)}.ts`, projectRoot).href, context);
  }

  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(candidate)) return next(candidate.href, context);
  }

  return next(specifier, context);
}
