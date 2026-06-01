/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Regenerates the checkpoints table inside `CompatibilityCheckpoints.md` (repo
 * root) from the single source of truth in `src/checkpoints.ts`. All surrounding
 * prose in the markdown file is left untouched.
 *
 * Run this after changing any checkpoint data (e.g. designating a new
 * checkpoint or updating a future-checkpoint estimate):
 *
 *   pnpm run generate-checkpoints-doc
 *
 * The committed table is verified by a unit test, so CI fails if it is stale.
 */

import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// jiti (used to run this script) resolves .js imports to .ts files automatically.
import {
	compatibilityCheckpointsDocRelativePath,
	findRepoRoot,
	injectCheckpointsTable,
} from "../src/checkpoints.js";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = findRepoRoot(scriptDir);
const outputPath = path.join(repoRoot, compatibilityCheckpointsDocRelativePath);

const original = readFileSync(outputPath, "utf8");
const updated = injectCheckpointsTable(original);
writeFileSync(outputPath, updated, "utf8");
console.log(`Updated table in ${path.relative(repoRoot, outputPath)}`);
