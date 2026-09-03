/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import sharedConfig, { importInternalModulesAllowed } from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [
						...importInternalModulesAllowed,

						// This package is not itself an example. It contains shared utilities for common example patterns / boilerplate.
						// Such utilities could be productionized in the future, so leveraging `assert` like other framework code seems reasonable.
						"@fluidframework/core-utils/internal",

						// `react-dom/client` is a subpath export, so the rule treats it as an internal module even though it is
						// React's public React 18 entry point.
						"react-dom/client",
					],
				},
			],
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react/no-deprecated": "off",
		},
	},
];

export default config;
