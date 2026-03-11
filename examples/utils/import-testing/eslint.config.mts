/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...strict,
	...sharedConfig,
	{
		// Override projectService to include the cross-package tsconfig that
		// typescript-eslint's auto-discovery can't find.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: [
					"./tsconfig.json",
					"./tsconfig.crossPackage.json",
					"./tsconfig.crossPackageConsumer.json",
					"./src/test/tsconfig.json",
				],
			},
		},
	},
];

export default config;
