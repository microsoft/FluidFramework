/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

interface AddTextOp {
	type: "addText";
	index: number;
	content: string;
	clientId: string;
}

interface RemoveRangeOp {
	type: "removeRange";
	start: number;
	end: number;
	clientId: string;
}

interface AddIntervalOp {
	type: "addInterval";
	start: number;
	end: number;
	collectionName: string;
	id: string;
	stickiness: number;
	clientId: string;
}

interface DeleteIntervalOp {
	type: "deleteInterval";
	collectionName: string;
	id: string;
	clientId: string;
}

interface ChangeIntervalOp {
	type: "changeInterval";
	collectionName: string;
	id: string;
	start: number;
	end: number;
	clientId: string;
}

interface RevertSharedStringRevertiblesOp {
	type: "revertSharedStringRevertibles";
	editsToRevert: number;
	clientId: string;
}

interface ChangePropertiesOp {
	type: "changeProperties";
	collectionName: string;
	id: string;
	properties: JSON;
	clientId: string;
}

interface RebaseOp {
	type: "rebase";
	clientId: string;
}

interface SynchronizeOp {
	type: "synchronize";
}

type SharedStringFuzzTestOperation =
	| AddTextOp
	| RemoveRangeOp
	| AddIntervalOp
	| DeleteIntervalOp
	| ChangeIntervalOp
	| RevertSharedStringRevertiblesOp
	| ChangePropertiesOp
	| RebaseOp
	| SynchronizeOp;

function getClientId(clientId: string): number {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return clientId.codePointAt(0)! - "A".codePointAt(0)!;
}

const imports = new Map([
	["MockContainerRuntimeFactoryForReconnection", "@fluidframework/test-runtime-utils"],
	["IIntervalCollection", "../intervalCollection"],
	["IntervalType, SequenceInterval", "../intervals"],
	["Client, assertConsistent, constructClients", "./intervalUtils"],
]);

/*
function applyLintFix(path: string): void {
	// Use the 'exec' function to run the shell command
	exec("npm run lint:fix", { cwd: path }, (error, stdout, stderr) => {
		if (error) {
			console.error(`Error running 'npm run lint:fix': ${error.message}`);
			return;
		}
		if (stderr) {
			console.error(`npm run lint:fix stderr: ${stderr}`);
			return;
		}
		console.log(`npm run lint:fix output: ${stdout}`);
	});
} */

export function saveStringFuzzTestToFile(jsonDir: string, targetDir: string, seed: number): void {
	const filePath: string = `${jsonDir}/${seed}.json`;
	// eslint-disable-next-line unicorn/prefer-json-parse-buffer
	const content = fs.readFileSync(filePath, "utf8");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const ops: SharedStringFuzzTestOperation[] = JSON.parse(content);

	let testContext = "";

	// Add the prefix
	testContext += `/*!\n`;
	testContext += `* Copyright (c) Microsoft Corporation and contributors. All rights reserved.\n`;
	testContext += `* Licensed under the MIT License.\n`;
	testContext += `*/\n`;

	for (const [key, value] of imports) {
		testContext += `import { ${key} } from "${value}"\n`;
	}

	testContext += `\n;`;
	testContext += `describe("failed fuzz test", () => {\n`;
	testContext += `let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;\n`;
	testContext += `let clients: [Client, Client, Client];\n`;
	testContext += `let collection: IIntervalCollection<SequenceInterval>;\n\n`;

	testContext += `beforeEach(() => {\n`;
	testContext += `containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();\n`;
	testContext += `clients = constructClients(containerRuntimeFactory);\n`;
	testContext += `});\n\n`;

	testContext += `it("fuzz test with seed ${seed}", () => {\n`;

	let i = 0;
	for (const op of ops) {
		switch (op.type) {
			case "addText": {
				testContext += `clients[${getClientId(op.clientId)}].sharedString.insertText(${
					op.index
				}, "${op.content}");\n`;

				break;
			}
			case "removeRange": {
				testContext += `clients[${getClientId(op.clientId)}].sharedString.removeRange(${
					op.start
				}, ${op.end});\n`;

				break;
			}
			case "addInterval": {
				testContext += `collection = clients[${getClientId(
					op.clientId,
				)}].sharedString.getIntervalCollection("${op.collectionName}");\n`;
				testContext += `collection.add(${op.start}, ${op.end}, IntervalType.SlideOnRemove, { intervalId: "${op.id}" }, ${op.stickiness} );\n`;

				break;
			}
			case "deleteInterval": {
				testContext += `collection = clients[${getClientId(
					op.clientId,
				)}].sharedString.getIntervalCollection("${op.collectionName}");\n`;
				testContext += `collection.removeIntervalById("${op.id}");\n`;

				break;
			}
			case "changeInterval": {
				testContext += `collection = clients[${getClientId(
					op.clientId,
				)}].sharedString.getIntervalCollection("${op.collectionName}");\n`;
				testContext += `collection.change("${op.id}", ${op.start}, ${op.end},);\n`;

				break;
			}
			case "changeProperties": {
				const properties = JSON.stringify(op.properties);
				testContext += `collection = clients[${getClientId(
					op.clientId,
				)}].sharedString.getIntervalCollection("${op.collectionName}");\n`;
				testContext += `const properties_${i} = ${properties};\n`;
				testContext += `collection.changeProperties("${op.id}", {...properties_${i}});\n`;
				i += 1;

				break;
			}
			case "revertSharedStringRevertibles": {
				testContext += `assert(isRevertibleSharedString(clients[${getClientId(
					op.clientId,
				)}].sharedString));\n`;
				testContext += `clients[${getClientId(
					op.clientId,
				)}].sharedString.isCurrentRevert = true;\n`;
				testContext += `revertSharedStringRevertibles(clients[${getClientId(
					op.clientId,
				)}].sharedString, clients[${getClientId(
					op.clientId,
				)}].sharedString.revertibles.splice(-${op.editsToRevert}, ${op.editsToRevert}));\n`;
				testContext += `clients[${getClientId(
					op.clientId,
				)}].sharedString.isCurrentRevert = false;\n`;

				break;
			}
			case "rebase": {
				testContext += `clients[${getClientId(op.clientId)}].containerRuntime.rebase();\n`;

				break;
			}
			case "synchronize": {
				testContext += "containerRuntimeFactory.processAllMessages();\n";
				testContext += "assertConsistent(clients);\n";

				break;
			}
			// No default
		}
	}

	testContext += `});\n`;
	testContext += `});\n`;

	const fileName = `${targetDir}/src/test/failedFuzzTest${seed}.ts`;

	fs.writeFileSync(fileName, testContext);
	// applyLintFix(targetDir);
}
