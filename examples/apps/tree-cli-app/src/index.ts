/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a node powered CLI application, so using node makes sense:
/* eslint-disable unicorn/no-process-exit */

import { applyEdit, loadDocument, saveDocument } from "./utils.js";

const args = process.argv.slice(2);

console.log(`Requires arguments: [<source>] [<destination>] [<edit>]`);
console.log();
console.log(
	`Example to load the default tree, insert 10 strings and 100 items, and save the result in the concise format:`,
);
console.log(`default data/large.concise.json string:10,item:100`);
console.log();
console.log(`Example to load data/large.concise.json, and log it to the console:`);
console.log(`data/large.concise.json`);
console.log();
console.log(
	`File formats are specified by extension, for example ".verbose.json" uses the "verbose" format.`,
);
console.log(
	`See implementation for supported formats and edit syntax: this is just a demo, not a nice app!`,
);
console.log();
console.log(`Running with augments: ${args}`);

if (args.length > 3) {
	process.exit(1);
}

const [sourceArg, destinationArg, editArg] = args;

const node = loadDocument(sourceArg);

if (editArg !== undefined) {
	applyEdit(editArg, node);
}

saveDocument(destinationArg, node);
