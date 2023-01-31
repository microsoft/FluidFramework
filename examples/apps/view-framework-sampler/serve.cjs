/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const esbuild = require("esbuild");
const options = require("./esbuild.cjs");

esbuild
	.serve(
		{
			servedir: "dist",
			port: 3000,
		},
		options.buildOptions,
	)
	.catch(() => process.exit());
