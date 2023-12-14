/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockStorage } from "@fluidframework/test-runtime-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { SnapshotLegacy } from "../snapshotlegacy";
import {
	createInsertOnlyAttributionPolicy,
	createPropertyTrackingAndInsertionAttributionPolicyFactory,
} from "../attributionPolicy";
import { TestSerializer } from "./testSerializer";
import { createClientsAtInitialState } from "./testClientLogger";
import { TestClient } from "./testClient";

describe("snapshot", () => {
	it("header only", async () => {
		const client1 = new TestClient();
		client1.startOrUpdateCollaboration("0");
		for (let i = 0; i < SnapshotLegacy.sizeOfFirstChunk; i++) {
			const op = client1.insertTextLocal(client1.getLength(), `${i % 10}`, { segment: i });
			const msg = client1.makeOpMessage(op, i + 1);
			msg.minimumSequenceNumber = i + 1;
			client1.applyMsg(msg);
		}

		const serializer = new TestSerializer();

		const snapshot = new SnapshotLegacy(client1.mergeTree, client1.logger);
		snapshot.extractSync();
		const summaryTree = snapshot.emit([], serializer, undefined!);
		const services = MockStorage.createFromSummary(summaryTree.summary);

		const client2 = new TestClient(undefined);
		const runtime: Partial<IFluidDataStoreRuntime> = {
			logger: client2.logger,
			clientId: "1",
		};
		await client2.load(runtime as IFluidDataStoreRuntime, services, serializer);

		assert.equal(client2.getLength(), client1.getLength());
		assert.equal(client2.getText(), client1.getText());
	}).timeout(5000);

	it("header and body", async () => {
		const clients = [new TestClient(), new TestClient(), new TestClient()];
		clients[0].startOrUpdateCollaboration("0");
		for (let i = 0; i < SnapshotLegacy.sizeOfFirstChunk + 10; i++) {
			const op = clients[0].insertTextLocal(clients[0].getLength(), `${i % 10}`, {
				segment: i,
			})!;
			const msg = clients[0].makeOpMessage(op, i + 1);
			msg.minimumSequenceNumber = i + 1;
			clients[0].applyMsg(msg);
		}

		const serializer = new TestSerializer();
		for (let i = 0; i < clients.length - 1; i++) {
			const client1 = clients[i];
			const client2 = clients[i + 1];
			const snapshot = new SnapshotLegacy(client1.mergeTree, client1.logger);
			snapshot.extractSync();
			const summaryTree = snapshot.emit([], serializer, undefined!);
			const services = MockStorage.createFromSummary(summaryTree.summary);
			const runtime: Partial<IFluidDataStoreRuntime> = {
				logger: client2.logger,
				clientId: (i + 1).toString(),
			};
			await client2.load(runtime as IFluidDataStoreRuntime, services, serializer);

			const client2Len = client2.getLength();
			assert.equal(
				client2Len,
				client1.getLength(),
				`client${client2.longClientId} and client${client1.longClientId} lengths don't match`,
			);

			assert.equal(
				client2.getText(SnapshotLegacy.sizeOfFirstChunk - 1),
				client1.getText(SnapshotLegacy.sizeOfFirstChunk - 1),
			);
		}
	}).timeout(5000);

	async function assertAttributionKeysMatch(
		client: TestClient,
		expected: {
			root: (number | undefined)[];
			channels?: { [name: string]: (number | undefined)[] };
		},
	): Promise<void> {
		assert.deepEqual(
			client.getAllAttributionSeqs(),
			expected.root,
			"Keys don't match before round-tripping",
		);
		for (const [channel, channelExpectation] of Object.entries(expected.channels ?? {})) {
			assert.deepEqual(
				client.getAllAttributionSeqs(channel),
				channelExpectation,
				`Keys for channel ${channel} don't match before round-trip.`,
			);
		}
		const serializer = new TestSerializer();
		// This avoids necessitating handling catchup ops.
		client.mergeTree.setMinSeq(client.mergeTree.collabWindow.currentSeq);
		const snapshot = new SnapshotLegacy(client.mergeTree, client.logger);
		snapshot.extractSync();
		const summaryTree = snapshot.emit([], serializer, undefined!);
		const services = MockStorage.createFromSummary(summaryTree.summary);

		const roundTripClient = new TestClient({
			attribution: {
				track: true,
				policyFactory: createInsertOnlyAttributionPolicy,
			},
		});
		const runtime: Partial<IFluidDataStoreRuntime> = {
			logger: roundTripClient.logger,
			clientId: "round-trips summary",
		};
		await roundTripClient.load(runtime as IFluidDataStoreRuntime, services, serializer);
		assert.deepEqual(
			roundTripClient.getAllAttributionSeqs(),
			expected.root,
			"Keys don't match after round-tripping",
		);
		for (const [channel, channelExpectation] of Object.entries(expected.channels ?? {})) {
			assert.deepEqual(
				roundTripClient.getAllAttributionSeqs(channel),
				channelExpectation,
				`Keys for channel ${channel} don't match after round-trip.`,
			);
		}
	}

	it("preserves attribution information", async () => {
		const clients = createClientsAtInitialState(
			{
				initialState: "",
				options: {
					attribution: {
						track: true,
						policyFactory:
							createPropertyTrackingAndInsertionAttributionPolicyFactory("foo"),
					},
				},
			},
			"A",
			"B",
		);

		const ops: ISequencedDocumentMessage[] = [];
		const applyAllOps = () =>
			ops.splice(0).forEach((op) => clients.all.map((client) => client.applyMsg(op)));

		ops.push(clients.A.makeOpMessage(clients.A.insertTextLocal(0, "hello world"), /* seq */ 1));

		applyAllOps();

		ops.push(
			clients.B.makeOpMessage(
				clients.B.insertTextLocal(6, "new "),
				/* seq */ 2,
				/* refSeq */ 1,
			),
		);

		ops.push(
			clients.B.makeOpMessage(
				clients.B.annotateRangeLocal(0, 14, { foo: "bar" }),
				/* seq */ 3,
				/* refSeq */ 2,
			),
		);

		applyAllOps();

		await assertAttributionKeysMatch(clients.A, {
			// "hello " has key 1 (i.e. seq 1), "new " has key 2 (i.e. seq 2), "world" has key 1.
			root: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1],
			channels: {
				foo: Array.from({ length: "hello new world".length }, (_, i) =>
					i < 14 ? 3 : undefined,
				),
			},
		});
	});

	it("doesn't include attribution information when attribution tracking is false on doc creation", async () => {
		const clients = createClientsAtInitialState(
			{
				initialState: "",
				options: { attribution: { track: false } },
			},
			"A",
		);

		const ops: ISequencedDocumentMessage[] = [];
		const applyAllOps = () =>
			ops.splice(0).forEach((op) => clients.all.map((client) => client.applyMsg(op)));

		ops.push(clients.A.makeOpMessage(clients.A.insertTextLocal(0, "hello world"), /* seq */ 1));

		applyAllOps();

		await assertAttributionKeysMatch(clients.A, {
			root: Array.from({ length: "hello world".length }, () => undefined),
		});
	});
});
