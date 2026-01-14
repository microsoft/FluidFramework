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
			// TODO: remove these overrides and fix violations
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			// This library uses and serializes "utf-8".
			"unicorn/text-encoding-identifier-case": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			// Disabled because the rule is crashing on this package - AB#51780
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			// It's valuable for tests to validate handling of `null` values, regardless of our API policies.
			"unicorn/no-null": "off",
			// Fine for tests to use `__dirname`
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
