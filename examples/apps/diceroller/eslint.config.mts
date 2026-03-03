/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		// TODO: remove this override once eslint-config-fluid has been updated to disable this rule.
		rules: {
			"react/react-in-jsx-scope": "off",
		},
	},
];

export default config;
