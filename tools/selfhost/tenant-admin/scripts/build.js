/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const path = require("node:path");
const esbuild = require("esbuild");

const packageRoot = path.join(__dirname, "..");
const copyrightBanner = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
`;

esbuild.buildSync({
	banner: { js: copyrightBanner },
	bundle: true,
	entryPoints: [path.join(packageRoot, "bin", "tenant-admin.js")],
	format: "cjs",
	legalComments: "inline",
	minify: true,
	outfile: path.join(packageRoot, "bundle", "tenant-admin.cjs"),
	platform: "node",
	target: "node22",
});
