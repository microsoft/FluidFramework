/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
];

export default config;
