/** Loads the resolution hooks. Use as: node --import ./scripts/register-app-imports.mjs … */
import { register } from "node:module";

register("./app-import-hooks.mjs", import.meta.url);
