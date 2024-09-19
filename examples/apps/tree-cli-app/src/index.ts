/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a node powered CLI application, so using node makes sense:
/* eslint-disable unicorn/no-process-exit */

import { loadDocument, saveDocument } from "./utils.js";

const args = process.argv.slice(2);

console.log(`Running with augments: ${args}`);

console.log(`Requires arguments: <source> <destination> <edit>`);

if (args.length > 3) {
	process.exit(1);
}

const [sourceArg, destinationArg, editArg] = args;

const node = loadDocument(sourceArg);

node.insertAtEnd("x");

saveDocument(destinationArg, node);
