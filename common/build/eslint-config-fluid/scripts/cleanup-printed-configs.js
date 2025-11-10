/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs/promises");
const path = require("path");
const sortJson = require("sort-json");

(async () => {
	const args = process.argv.slice(2);
	const sourcePath = args[0];
	const files = await fs.promises.readdir(sourcePath);
	const writePromises = [];

	for (const file of files) {
		const filePath = path.join(sourcePath, file);
		const stat = await fs.promises.stat(filePath);
		if (stat.isDirectory()) {
			continue;
		}
		const originalContent = await fs.readFile(filePath, "utf8");
		const json = JSON.parse(originalContent);

		// Remove the parser property because it's an absolute path and will vary based on the local environment.
		delete json.parser;

		// Generate the new content with sorting applied
		// Sorting at all is desirable as otherwise changes in the order of common config references may cause large diffs
		// with little semantic meaning.
		// On the other hand, fully sorting the json can be misleading:
		// some eslint settings depend on object key order ("import-x/resolver" being a known one, see
		// https://github.com/un-ts/eslint-plugin-import-x/blob/master/src/utils/resolve.ts).
		// Using depth 2 is a nice compromise.
		const newContent = sortJson.format(json, { indentSize: 4, depth: 2 });

		// Only write the file if the content has changed
		if (newContent !== originalContent) {
			writePromises.push(fs.writeFile(filePath, newContent));
		}
	}

	await Promise.all(writePromises);
})();
