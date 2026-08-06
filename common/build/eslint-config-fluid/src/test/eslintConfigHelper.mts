/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Test helper for creating ESLint instances from a flat config array.
 */

import { ESLint } from "eslint";
import type { Linter } from "eslint";

/**
 * Creates an ESLint instance configured with the given flat config array.
 *
 * Disables automatic config-file lookup (`overrideConfigFile: true`) so only
 * the provided config is active — no `eslint.config.*` on disk is merged in.
 * This lets tests exercise a specific config in isolation.
 */
export function createESLintForConfig(config: readonly Linter.Config[]): ESLint {
	return new ESLint({
		overrideConfigFile: true,
		// ESLint expects a mutable array; the readonly wrapper is a TypeScript-only concern.
		overrideConfig: config as Linter.Config[],
	});
}
