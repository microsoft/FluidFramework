#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
	const oclif = await import("@oclif/core");
	await oclif.execute({ development: false, dir: __dirname });
})();
