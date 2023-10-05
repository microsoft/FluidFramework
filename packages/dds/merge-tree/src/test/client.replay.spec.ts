/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import * as fs from "fs";
import assert from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeOp, MergeTreeDeltaType } from "../ops";
import { createGroupOp } from "../opBuilder";
import { TestClient } from "./testClient";
import { ReplayGroup, replayResultsPath } from "./mergeTreeOperationRunner";
import { TestClientLogger } from "./testClientLogger";

describe("MergeTree.Client", () => {
	for (const filePath of fs.readdirSync(replayResultsPath)) {
		it(`Replay ${filePath}`, async () => {
			const file: ReplayGroup[] = JSON.parse(
				fs.readFileSync(`${replayResultsPath}/${filePath}`).toString(),
			);
			const msgClients = new Map<
				string,
				{ client: TestClient; msgs: ISequencedDocumentMessage[] }
			>();
			const originalClient = new TestClient();
			msgClients.set("A", { client: originalClient, msgs: [] });
			originalClient.insertTextLocal(0, file[0].initialText);
			originalClient.startOrUpdateCollaboration("A");
			for (const group of file) {
				for (const msg of group.msgs) {
					assert(msg.clientId, "expected clientId to be defined");
					if (!msgClients.has(msg.clientId)) {
						const client = await TestClient.createFromClientSnapshot(
							originalClient,
							msg.clientId,
						);
						msgClients.set(msg.clientId, { client, msgs: [] });
					}
				}
			}
			for (const group of file) {
				const logger = new TestClientLogger(
					[...msgClients.values()].map((mc) => mc.client),
				);
				const initialText = logger.validate();
				assert.strictEqual(initialText, group.initialText, "Initial text not as expected");
				for (const msg of group.msgs) {
					const msgClient = msgClients.get(msg.clientId!)!;
					while (
						msgClient.msgs.length > 0 &&
						msg.referenceSequenceNumber > msgClient.client.getCurrentSeq()
					) {
						msgClient.client.applyMsg(msgClient.msgs.shift()!);
					}
					const op = msg.contents as IMergeTreeOp;
					msgClient.client.localTransaction(
						op.type === MergeTreeDeltaType.GROUP ? op : createGroupOp(op),
					);
					msgClients.forEach((mc) => mc.msgs.push(msg));
				}

				msgClients.forEach((mc) => {
					while (mc.msgs.length > 0) {
						mc.client.applyMsg(mc.msgs.shift()!);
					}
				});
				const result = logger.validate();
				assert.strictEqual(result, group.resultText, "Result text not as expected");
				logger.dispose();
			}
		}).timeout(30 * 10000);
	}
});
