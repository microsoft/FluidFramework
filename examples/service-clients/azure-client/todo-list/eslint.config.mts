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
			// Demoted to warning as a workaround to layer-check challenges. Tracked by:
			// https://github.com/microsoft/FluidFramework/issues/10226
			"import-x/no-extraneous-dependencies": "warn",
		},
	},
];

export default config;
