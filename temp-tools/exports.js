/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const JSON5 = require("json5");
const path = require("path");
const fs = require("fs");
const _ = require("lodash");

// Assume current working directory is the package root.
const packageRoot = process.cwd();

// From the package root, compute how many repetitions of '../' get us to the repo root.
const workspaceRoot = (() => {
  	let relativePath = "../".repeat(packageRoot.split(path.sep).length - 3);
  	return relativePath.slice(0, relativePath.length - 1);
})();

// Load 'package.json'
const packagePath = path.join(packageRoot, "package.json");
const package = JSON5.parse(fs.readFileSync(packagePath, "utf8"));

function getExt(filepath, defaultExt) {
    return filepath === undefined ? defaultExt : path.extname(filepath);
}

// If package has exports, update them to include /public, /beta, /fruit, and /internal.
if (package.exports !== undefined) {
    const shortName = package.name.split("/")[1];

    const esmDtsExt = getExt(package.exports["."]?.import?.types);
    const esmJsExt = getExt(package.exports["."]?.import?.default);

    const esmExports = {
        ".": {
            "import": {
                "types": `./lib/index.d${esmDtsExt}`,
                "default": `./lib/index${esmJsExt}`
            },
        },
        "./public": {
            "import": {
                "types": `./lib/${shortName}-public.d${esmDtsExt}`,
                "default": `./lib/index${esmJsExt}`
            },
        },
        "./beta": {
            "import": {
                "types": `./lib/${shortName}-beta.d${esmDtsExt}`,
                "default": `./lib/index${esmJsExt}`
            },
        },
        "./fruit": {
            "import": {
                "types": `./lib/${shortName}-alpha.d${esmDtsExt}`,
                "default": `./lib/index${esmJsExt}`
            },
        },
        "./internal": {
            "import": {
                "types": `./lib/index.d${esmDtsExt}`,
                "default": `./lib/index${esmJsExt}`
            },
        },
    }

    const cjsDtsExt = getExt(package.exports["."]?.require?.types);
    const cjsJsExt = getExt(package.exports["."]?.require?.default);

    const cjsExports = {
        ".": {
            "require": {
                "types": `./dist/index.d${cjsDtsExt}`,
                "default": `./dist/index${cjsJsExt}`
            }
        },
        "./public": {
            "require": {
                "types": `./dist/${shortName}-public.d${cjsDtsExt}`,
                "default": `./dist/index${cjsJsExt}`
            }
        },
        "./beta": {
            "require": {
                "types": `./dist/${shortName}-beta.d${cjsDtsExt}`,
                "default": `./dist/index${cjsJsExt}`
            }
        },
        "./fruit": {
            "require": {
                "types": `./dist/${shortName}-alpha.d${cjsDtsExt}`,
                "default": `./dist/index${cjsJsExt}`
            }
        },
        "./internal": {
            "require": {
                "types": `./dist/index.d${cjsDtsExt}`,
                "default": `./dist/index${cjsJsExt}`
            }
        },
    }

	// Before merging, delete any existing /public, /alpha, /beta, /internal so that
	// we cannonicalize the import order.
    delete package.exports["./public"];
    delete package.exports["./alpha"];
    delete package.exports["./beta"];
    delete package.exports["./internal"];

    let exports = {};
    if (package.exports["."].import === undefined) { exports = cjsExports }
    else if (package.exports["."].require === undefined) { exports = esmExports }
    else {
        exports = _.merge(esmExports, cjsExports);

		// If it's a dual-format package, add an 'attw' check.
        package.scripts["check:are-the-types-wrong"] = "attw --pack . --entrypoints .";
    }

    package.exports = Object.assign(package.exports, exports);
}

fs.writeFileSync(packagePath, JSON.stringify(package, null, 4));
