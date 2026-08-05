/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		// The React version alias loader is plain ESM/CommonJS module-resolution tooling (not part of the
		// package's TypeScript sources), so the TypeScript-oriented lint rules don't apply. Formatting is
		// still enforced by biome.
		ignores: ["src/test/reactAlias/**"],
	},
];

export default config;
