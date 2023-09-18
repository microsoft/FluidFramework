/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

interface SetOp {
	type: "set";
	clientId: string;
	key: string;
	value: string;
}

interface DeleteOp {
	type: "delete";
	key: string;
	clientId: string;
}

interface ClearOp {
	type: "clear";
	clientId: string;
}

interface AddClientOp {
	type: "addClient";
	addedClientId: string;
}

interface RebaseOp {
	type: "rebase";
	clientId: string;
}

interface SynchronizeOp {
	type: "synchronize";
}

type MapFuzzTestOperation = SetOp | DeleteOp | ClearOp | AddClientOp | RebaseOp | SynchronizeOp;

function getClientId(clientId: string): number {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return clientId.codePointAt(0)! - "A".codePointAt(0)!;
}

export function saveMapFuzzTestToFile(dir: string, seed: number): void {
	const filePath: string = `results/${dir}/${seed}.json`;
	// eslint-disable-next-line unicorn/prefer-json-parse-buffer
	const content = fs.readFileSync(filePath, "utf8");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const ops: MapFuzzTestOperation[] = JSON.parse(content);

	let testContext = "";

	for (const op of ops) {
		switch (op.type) {
			case "set": {
				testContext += `clients[${getClientId(op.clientId)}].sharedMap.set(${op.key}, ${
					op.value
				});\n`;

				break;
			}
			case "delete": {
				testContext += `clients[${getClientId(op.clientId)}].sharedMap.delete(${
					op.key
				});\n`;

				break;
			}
			case "clear": {
				testContext += `clients[${getClientId(op.clientId)}].sharedMap.clear();\n`;

				break;
			}
			case "synchronize": {
				testContext += `containerRuntimeFactory.processAllMessages();\n`;
				testContext += `assertMapClientConsistent(clients);\n`;

				break;
			}
			case "addClient": {
				testContext += `addMapClient(${getClientId(
					op.addedClientId,
				)}, runtimeFactory, clients);\n`;

				break;
			}
			// No default
		}
	}

	const outputFile = `${dir}/test.ts`;

	fs.writeFileSync(outputFile, testContext);
}
