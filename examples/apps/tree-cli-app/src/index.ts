/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a node powered CLI application, so using node makes sense:
/* eslint-disable unicorn/no-process-exit */

import { applyEdit, loadDocument, saveDocument } from "./utils.js";

const args = process.argv.slice(2);

console.log(`Requires arguments: [<source>] [<destination>] [<edit>]`);
console.log(`Example arguments: default data/large.concise.json string:10,item:100`);
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
