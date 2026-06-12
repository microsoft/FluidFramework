/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react-hooks/exhaustive-deps": ["error"],
			"react-hooks/rules-of-hooks": "error",
			"@eslint-react/no-missing-key": "error",
			"@eslint-react/jsx-key-before-spread": "error",
			"@eslint-react/no-string-refs": "error",
			"@eslint-react/no-nested-component-definitions": "error",
			"@eslint-react/dom/no-unsafe-target-blank": "error",
			"@eslint-react/no-useless-fragment": ["error", { allowExpressions: true }],
		},
	},
];

export default config;
