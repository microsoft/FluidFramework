/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

import { strict } from "../../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...strict,
	...sharedConfig,
	{
		rules: {
			"import-x/no-extraneous-dependencies": "warn",
		},
	},
];

export default config;
