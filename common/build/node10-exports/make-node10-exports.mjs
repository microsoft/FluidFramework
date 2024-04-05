import fs from "fs";
import path from "path";

const pkg = JSON.parse(fs.readFileSync("./package.json"));

function template(file) {
	return `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export * from "${file}";
`;
}

function writeStubs(mapEntry, folder) {
	let jsFile = path.relative(path.resolve(folder), mapEntry.default);
	if (!jsFile.endsWith(".js")) {
		throw new Error(`Not a '.js' file: ${jsFile}`);
	}

	let dtsFile = path.relative(path.resolve(folder), mapEntry.types);
	if (!dtsFile.endsWith(".d.ts")) {
		throw new Error(`Not a '.d.ts' file: ${dtsFile}`);
	}

	if (fs.existsSync(folder)) {
		throw new Error(`Folder already exists: ${folder}`);
	}

	fs.mkdirSync(folder, { recursive: true });
	// fs.writeFileSync(path.join(folder, "index.js"), template(jsFile));
	fs.writeFileSync(path.join(folder, "index.d.ts"), template(dtsFile));
}

for (const [key, value] of Object.entries(pkg.exports)) {
	// Skip root export
	if (key !== "." && key !== "./") {
		console.log(key);

		if (value.import) {
			writeStubs(value.import,  path.resolve(key));
		} else {
			throw new Error(`Unknown export type: ${JSON.stringify(value)}`);
		}
	}
}
