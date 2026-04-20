/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	TypedEventEmitter,
	type IProvideLayerCompatDetails,
} from "@fluid-internal/client-utils";
import type { AttachState, IAudience } from "@fluidframework/container-definitions/";
import type {
	ICriticalContainerError,
	IContainer,
	IContainerEvents,
	IDeltaManager,
	IDeltaManagerEvents,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions/internal";
import type { IClient } from "@fluidframework/driver-definitions";
import type {
	IDocumentServiceFactory,
	IResolvedUrl,
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	GenericError,
	MockLogger,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { Audience } from "../audience.js";
import { ConnectionState } from "../connectionState.js";
import { Container, waitContainerToCatchUp } from "../container.js";
import { ProtocolHandler } from "../protocol.js";

import { AbsentProperty, failProxy, failSometimeProxy } from "./failProxy.js";
import { createTestCodeLoaderProxy } from "./testProxies.js";

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
	deltaManager = new MockDeltaManager() as unknown as IDeltaManager<
		ISequencedDocumentMessage,
		IDocumentMessage
	>;
	resolvedUrl?: IResolvedUrl | undefined;
	attachState?: AttachState;
	closed?: boolean = false;
	isDirty?: boolean;
	connectionState?: ConnectionState;
	connected?: boolean | undefined;
	audience?: IAudience;
	clientId?: string | undefined;
	readOnlyInfo?: ReadOnlyInfo;

	get mockDeltaManager(): MockDeltaManager {
		return this.deltaManager as unknown as MockDeltaManager;
	}

	connect(): void {
		this.connectionState = ConnectionState.Connected;
		this.emit("connected");
	}
}

const documentServiceFactoryProxy = failSometimeProxy<
	IDocumentServiceFactory & IProvideLayerCompatDetails
>({
	ILayerCompatDetails: AbsentProperty,
});

function createTestContainer(mockLogger: MockLogger): Container {
	return new Container({
		urlResolver: failProxy(),
		documentServiceFactory: documentServiceFactoryProxy,
		codeLoader: createTestCodeLoaderProxy(),
		options: {},
		scope: {},
		subLogger: createChildLogger({ logger: mockLogger }),
	});
}

describe("Container close/dispose telemetry", () => {
	it("ContainerClose is logged as error when close is called with an error during loading", () => {
		const mockLogger = new MockLogger();
		const container = createTestContainer(mockLogger);
		const testError = new GenericError(
			"test load failure",
		) as unknown as ICriticalContainerError;

		container.close(testError);

		const closeEvent = mockLogger.events.find(
			(e) => typeof e.eventName === "string" && e.eventName.endsWith("ContainerClose"),
		);
		assert(closeEvent !== undefined, "ContainerClose event should be logged");
		assert.strictEqual(
			closeEvent.category,
			"error",
			"ContainerClose should be category 'error' when closed with an error during loading",
		);
	});

	it("ContainerDispose is logged as generic when dispose is called with an error after close", () => {
		const mockLogger = new MockLogger();
		const container = createTestContainer(mockLogger);
		const testError = new GenericError(
			"test load failure",
		) as unknown as ICriticalContainerError;

		container.close(testError);
		container.dispose(testError);

		const disposeEvent = mockLogger.events.find(
			(e) => typeof e.eventName === "string" && e.eventName.endsWith("ContainerDispose"),
		);
		assert(disposeEvent !== undefined, "ContainerDispose event should be logged");
		assert.strictEqual(
			disposeEvent.category,
			"generic",
			"ContainerDispose should be category 'generic' when disposed with an error after close",
		);
	});

	it("ContainerClose is logged as generic when close is called without an error", () => {
		const mockLogger = new MockLogger();
		const container = createTestContainer(mockLogger);

		container.close();

		const closeEvent = mockLogger.events.find(
			(e) => typeof e.eventName === "string" && e.eventName.endsWith("ContainerClose"),
		);
		assert(closeEvent !== undefined, "ContainerClose event should be logged");
		assert.strictEqual(
			closeEvent.category,
			"generic",
			"ContainerClose should be category 'generic' when closed without an error",
		);
	});

	it("ContainerDispose is logged as generic when dispose is called without an error", () => {
		const mockLogger = new MockLogger();
		const container = createTestContainer(mockLogger);

		container.close();
		container.dispose();

		const disposeEvent = mockLogger.events.find(
			(e) => typeof e.eventName === "string" && e.eventName.endsWith("ContainerDispose"),
		);
		assert(disposeEvent !== undefined, "ContainerDispose event should be logged");
		assert.strictEqual(
			disposeEvent.category,
			"generic",
			"ContainerDispose should be category 'generic' when disposed without an error",
		);
	});
});

describe("Container", () => {
	describe("waitContainerToCatchUp", () => {
		it("Closed Container fails", async () => {
			const mockContainer = new MockContainer();
			mockContainer.closed = true;

			await assert.rejects(
				async () => waitContainerToCatchUp(mockContainer as unknown as IContainer),
				"Passing a closed container should throw",
			);
		});

		it("Connected Container waits for catching up", async () => {
			const mockContainer = new MockContainer();
			mockContainer.connectionState = ConnectionState.Connected;

			const waitP = waitContainerToCatchUp(mockContainer as unknown as IContainer);
			mockContainer.mockDeltaManager.emit("op", { sequenceNumber: 2 });

			// Should resolve immediately, otherwise test will time out
			await waitP;
		});

		it("Connected and caught up Container resolves immediately", async () => {
			const mockContainer = new MockContainer();
			mockContainer.mockDeltaManager.lastSequenceNumber = 2; // to match lastKnownSeqNumber
			mockContainer.connectionState = ConnectionState.Connected;

			const waitP = waitContainerToCatchUp(mockContainer as unknown as IContainer);

			// Should resolve immediately, otherwise test will time out
			await waitP;
		});

		it("Disconnected Container gets Connected then waits for catching up", async () => {
			const mockContainer = new MockContainer();
			mockContainer.connectionState = ConnectionState.Disconnected;

			const waitP = waitContainerToCatchUp(mockContainer as unknown as IContainer);
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
