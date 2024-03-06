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
const publicExports = exports["."];

//if (publicExports !== undefined) {
	if (publicExports.require !== undefined) {
		pkg.main = publicExports.require.default;
		pkg.types = publicExports.require.types;
	} else {
		pkg.main = publicExports.import.default;
		pkg.types = publicExports.import.types;
	}

	delete pkg.module;

	exports["."] = publicExports;
	delete exports["./public"];
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));

	format();
//}
