/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			// Demoted to warning as a workaround to layer-check challenges. Tracked by:
			// https://github.com/microsoft/FluidFramework/issues/10226
			"import-x/no-extraneous-dependencies": "warn",

			// Incompatible with prettier
			// TODO: this can be removed once the eslint config is updated to version 5.4.0 or greater.
			"unicorn/number-literal-case": "off",

			// Incompatible with formatter
			// TODO: this can be removed once the eslint config is updated to version 5.4.0 or greater.
			"@typescript-eslint/brace-style": "off",
		},
	},
];

export default config;
