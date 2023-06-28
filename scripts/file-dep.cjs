/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script sets the eslint dep to a file dep. This can be used with flub exec to update the dependency on our shared
 * eslint config. For exanple:
 * 
 * flub exec -g client -- "node /code/FluidFramework/scripts/file-dep.cjs"
 */

const fs = require("fs");
const path = require("path");

const eslintPath = path.join(__dirname, "../common/build/eslint-config-fluid");

// const repo = new FluidRepo();

const pkg = JSON.parse(fs.readFileSync("./package.json"));
if (
	pkg.devDependencies &&
	Object.keys(pkg.devDependencies).includes("@fluidframework/eslint-config-fluid")
) {
	const relPath = path.relative(process.cwd(), eslintPath);
	pkg.devDependencies["@fluidframework/eslint-config-fluid"] = `file:${relPath}`;
	fs.writeFileSync("./package.json", JSON.stringify(pkg, undefined, "\t"));
} else {
	console.error("No eslint dependency");
	process.setMaxListeners(1);
}

process.exit(0);
