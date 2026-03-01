/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

// There are a lot of intentional internal APIs leveraged here for simplicity. Skip common example rules:
// (Does not extend ../../eslint.config.data.mts)
const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		files: ["src/test/**/*"],
	},
];

export default config;
