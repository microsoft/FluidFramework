/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	...sharedConfig,
	{
		rules: {
			// This is an example/test app; all its dependencies are dev dependencies so as not to pollute the lockfile
			// with prod dependencies that aren't actually shipped. So don't complain when importing from dev dependencies.
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": true,
				},
			],
		},
	},
	// Migrated from .eslintignore
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;
