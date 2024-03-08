/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Script to overwrite a dual-format package with the cannonical exports.

// Note: 'exports.js' does this better (merges with existing exports rather than clobbering all exports.)

import JSON5 from "json5";
import path from "path";
import fs from "fs";
import { format } from "./format.mjs";

const pkgRoot = process.cwd();
const pkgPath = path.join(pkgRoot, "package.json");
const pkg = JSON5.parse(fs.readFileSync(pkgPath, "utf8"));

pkg.type = "module";
const exports = pkg.exports;
const publicExports = exports["./public"];

if (publicExports !== undefined) {
	const publicTypes = (
		publicExports.require !== undefined
			? publicExports.require.types
			: publicExports.import !== undefined
			? packageExports.import.types
			: packageExports.types
	).replace(/\.\//g, "");

	pkg.types = publicTypes;

	delete pkg.module;

	exports["."] = publicExports;
	delete exports["./public"];
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));

	format();
}
