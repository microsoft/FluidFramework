/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			// TODO: remove this override and fix violations
			"@typescript-eslint/strict-boolean-expressions": "off",
			// This package implements test utils to be run under Node.JS.
			"import-x/no-nodejs-modules": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["execa"],
				},
			],

			// TODO: This package should use tinyexec or child_process directly instead of execa
		},
	},
];

export default config;
