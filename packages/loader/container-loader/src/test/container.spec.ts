/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { AttachState, IAudience } from "@fluidframework/container-definitions/";
import {
	IContainer,
	IContainerEvents,
	IDeltaManager,
	IDeltaManagerEvents,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions/internal";
import { ISequencedDocumentMessage, IClient } from "@fluidframework/driver-definitions";
import { IResolvedUrl, IDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { Audience } from "../audience.js";
import { ConnectionState } from "../connectionState.js";
import { waitContainerToCatchUp } from "../container.js";
import { ProtocolHandler } from "../protocol.js";

class MockDeltaManager
	extends TypedEventEmitter<IDeltaManagerEvents>
	implements
		Partial<
			Omit<IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>, "on" | "off" | "once">
		>
{
	hasCheckpointSequenceNumber = true;
	lastKnownSeqNumber = 2;
	lastSequenceNumber = 1;
}

class MockContainer
	extends TypedEventEmitter<IContainerEvents>
	implements Partial<Omit<IContainer, "on" | "off" | "once">>
{
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> =
		new MockDeltaManager() as any;
	resolvedUrl?: IResolvedUrl | undefined;
	attachState?: AttachState | undefined;
	closed?: boolean | undefined = false;
	isDirty?: boolean | undefined;
	connectionState?: ConnectionState | undefined;
	connected?: boolean | undefined;
	audience?: IAudience | undefined;
	clientId?: string | undefined;
	readOnlyInfo?: ReadOnlyInfo | undefined;

	get mockDeltaManager() {
		return this.deltaManager as any as MockDeltaManager;
	}

	connect() {
		this.connectionState = ConnectionState.Connected;
		this.emit("connected");
	}
}

describe("Container", () => {
	describe("waitContainerToCatchUp", () => {
		it("Closed Container fails", async () => {
			const mockContainer = new MockContainer();
			mockContainer.closed = true;

			await assert.rejects(
				async () => waitContainerToCatchUp(mockContainer as any as IContainer),
				"Passing a closed container should throw",
			);
		});

		it("Connected Container waits for catching up", async () => {
			const mockContainer = new MockContainer();
			mockContainer.connectionState = ConnectionState.Connected;

			const waitP = waitContainerToCatchUp(mockContainer as any as IContainer);
			mockContainer.mockDeltaManager.emit("op", { sequenceNumber: 2 });

			// Should resolve immediately, otherwise test will time out
			await waitP;
		});

		it("Connected and caught up Container resolves immediately", async () => {
			const mockContainer = new MockContainer();
			mockContainer.mockDeltaManager.lastSequenceNumber = 2; // to match lastKnownSeqNumber
			mockContainer.connectionState = ConnectionState.Connected;

			const waitP = waitContainerToCatchUp(mockContainer as any as IContainer);

			// Should resolve immediately, otherwise test will time out
			await waitP;
		});

		it("Disconnected Container gets Connected then waits for catching up", async () => {
			const mockContainer = new MockContainer();
			mockContainer.connectionState = ConnectionState.Disconnected;

			const waitP = waitContainerToCatchUp(mockContainer as any as IContainer);
			mockContainer.mockDeltaManager.emit("op", { sequenceNumber: 2 });

			// Should resolve immediately, otherwise test will time out
			await waitP;
		});

		it("Audience", () => {
			const protocolHandler = new ProtocolHandler(
				{ minimumSequenceNumber: 0, sequenceNumber: 0 }, // attributes
				{ members: [], proposals: [], values: [] }, // quorumSnapshot
				(key, value) => 0, // sendProposal
				new Audience(),
				(clientId: string) => false, // shouldClientHaveLeft
			);

			const client: Partial<IClient> = { mode: "write" };
			protocolHandler.quorum.addMember("fakeClient", {
				client: client as IClient,
				sequenceNumber: 10,
			});
			const quorumSnapshot = protocolHandler.snapshot();

			const protocolHandler2 = new ProtocolHandler(
				{ minimumSequenceNumber: 0, sequenceNumber: 0 }, // attributes
				quorumSnapshot,
				(key, value) => 0, // sendProposal
				new Audience(),
				(clientId: string) => false, // shouldClientHaveLeft
			);

			// Audience is superset of quorum!
			assert(protocolHandler2.audience.getMembers().size === 1);

			// audience and quorum should not change across serialization.
			assert.deepEqual(
				protocolHandler.quorum.getMembers(),
				protocolHandler2.quorum.getMembers(),
			);
			assert.deepEqual(
				protocolHandler.audience.getMembers(),
				protocolHandler2.audience.getMembers(),
			);
		});
	});
});
