/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultLogger } from "./common/logging";
import { removePackageJson, tscWrapper } from "./tscWrapper";

const { errorLog } = defaultLogger;

tscWrapper("esm")
	.catch((e) => {
		errorLog(`Unexpected error. ${e.message}`);
		errorLog(e.stack);
	})
	.finally(() => {
		removePackageJson();
	});
