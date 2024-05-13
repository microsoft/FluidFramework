/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");
const sortJson = require("sort-json");

(async () => {
	const args = process.argv.slice(2);
	const sourcePath = args[0];
	const files = await fs.promises.readdir(sourcePath);

	for (const file of files) {
		const filePath = path.join(sourcePath, file);
		const content = fs.readFileSync(filePath);
		const json = JSON.parse(content);

		// Remove the parser property because it's an absolute path and will vary based on the local environment.
		delete json.parser;

		// Write out the file.
		fs.writeFileSync(filePath, JSON.stringify(json, undefined, 4));

		// Sort the JSON in-place.
		// Sorting at all is desirable as otherwise changes in the order of common config references may cause large diffs
		// with little semantic meaning.
		// On the other hand, fully sorting the json can be misleading:
		// some eslint settings depend on object key order ("import/resolver" being a known one, see
		// https://github.com/import-js/eslint-plugin-import/blob/c0ac54b8a721c2b1c9048838acc4d6282f4fe7a7/utils/resolve.js).
		// Using depth 2 is a nice compromise.
		sortJson.overwrite(filePath, { indentSize: 4, depth: 2 });
	}
})();
