/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
	AttachState,
	IAudience,
	IContainer,
	IContainerEvents,
	IDeltaManager,
	IDeltaManagerEvents,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, IDocumentMessage } from "@fluidframework/protocol-definitions";
import { waitContainerToCatchUp } from "../container";
import { ConnectionState } from "../connectionState";

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
	});
});
