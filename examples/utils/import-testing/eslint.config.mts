/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...strict,
	...sharedConfig,
	{
		files: ["src/test/crossPackageImporter.ts"],
		rules: {
			// Allow importing the cross-package schema via package self-reference subpath.
			"import-x/no-internal-modules": "off",
		},
	},
];

export default config;
