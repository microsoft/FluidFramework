/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Script to overwrite a dual-format package with the cannonical exports.

// Note: 'exports.js' does this better (merges with existing exports rather than clobbering all exports.)

const JSON5 = require("json5");
const path = require("path");
const fs = require("fs");

const packageRoot = process.cwd();

const workspaceRoot = (() => {
  let relativePath = "../".repeat(packageRoot.split(path.sep).length - 3);
  return relativePath.slice(0, relativePath.length - 1);
})();

const packagePath = path.join(packageRoot, "package.json");
const package = JSON5.parse(fs.readFileSync(packagePath, "utf8"));

package.type = "module";

const shortName = package.name.split("/")[1];
package.exports = {
	".": {
		"import": {
			"types": `./lib/${shortName}-public.d.ts`,
			"default": "./lib/index.js"
		},
		"require": {
			"types": `./dist/${shortName}-public.d.ts`,
			"default": "./dist/index.js"
		}
	},
	"./beta": {
		"import": {
			"types": `./lib/${shortName}-beta.d.ts`,
			"default": "./lib/index.js"
		},
		"require": {
			"types": `./dist/${shortName}-beta.d.ts`,
			"default": "./dist/index.js"
		}
	},
	"./fruit": {
		"import": {
			"types": `./lib/${shortName}-alpha.d.ts`,
			"default": "./lib/index.js"
		},
		"require": {
			"types": `./dist/${shortName}-alpha.d.ts`,
			"default": "./dist/index.js"
		}
	},
	"./internal": {
		"import": {
			"types": "./lib/index.d.ts",
			"default": "./lib/index.js"
		},
		"require": {
			"types": "./dist/index.d.ts",
			"default": "./dist/index.js"
		}
	}
};
delete package.module;
fs.writeFileSync(packagePath, JSON.stringify(package, null, 4));