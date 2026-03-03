/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		// TODO: remove this override once eslint-config-fluid has been updated to disable this rule.
		rules: {
			"react/react-in-jsx-scope": "off",
		},
	},
];

export default config;
