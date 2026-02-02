/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strictBiome } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strictBiome,
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// This package has non-standard test directories (mocha/, jest/, types/) that
		// typescript-eslint's projectService can't auto-discover.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: [
					"./tsconfig.json",
					"./src/test/mocha/tsconfig.json",
					"./src/test/jest/tsconfig.cjs.json",
					"./src/test/types/tsconfig.json",
				],
			},
		},
	},
];

export default config;
