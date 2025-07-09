/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import type {
	ContainerExtension,
	ContainerExtensionId,
	ExtensionHost,
	ExtensionRuntimeProperties,
} from "@fluidframework/container-runtime-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";

import { ContainerRuntime } from "../containerRuntime.js";

interface TestExtensionRuntimeProperties extends ExtensionRuntimeProperties {
	SignalMessages: { type: string; content: unknown };
}

interface ITestContainerContext extends IContainerContext {
	connected: boolean;
	canSendSignals: boolean | undefined;
}

class TestExtension implements ContainerExtension<TestExtensionRuntimeProperties> {
	public readonly interface: {
		isConnected: boolean;
	};

	public readonly extension = this;

	constructor(host: ExtensionHost<TestExtensionRuntimeProperties>) {
		this.interface = {
			get isConnected(): boolean {
				const connected = host.isConnected();
				return connected;
			},
		};
	}

	public onNewUse(): void {
		// No-op
	}
}

const TestExtensionFactory = class extends TestExtension {
	constructor(host: ExtensionHost<TestExtensionRuntimeProperties>) {
		super(host);
	}
};

const testExtensionId: ContainerExtensionId = "test:extension";
enum ConnectionState {
	Disconnected = 0,
	EstablishingConnection = 3,
	CatchingUp = 1,
	Connected = 2,
}

/**
 * Creates a mock container context with the specified canSendSignals and connection state
 */
function createMockContext(
	canSendSignals: boolean | undefined,
	connectionState: ConnectionState,
): ITestContainerContext {
	const connected = connectionState === ConnectionState.Connected;
	const mockContext: ITestContainerContext = {
		attachState: AttachState.Attached,
		deltaManager: new MockDeltaManager(),
		quorum: new MockQuorumClients(),
		audience: new MockAudience(),
		updateDirtyContainerState: (): void => {},
		getLoadedFromVersion: (): undefined => undefined,
		submitBatchFn: (): number => 1,
		submitSummaryFn: (): number => 1,
		submitSignalFn: (): void => {},
		clientId: "mockClientId",
		connected,
		storage: {} as unknown as IContainerContext["storage"],
		baseSnapshot: undefined,
		options: {},
		loader: {} as unknown as IContainerContext["loader"],
		canSendSignals,
		clientDetails: { capabilities: { interactive: true } },
		submitFn: (): number => 1,
		disposeFn: (): void => {},
		closeFn: (): void => {},
		taggedLogger: new MockLogger(),
		scope: {},
		getAbsoluteUrl: async (): Promise<string> => "mockUrl",
		id: "mockId",
	};
	return mockContext;
}

/**
 * Creates a ContainerRuntime for testing
 */
async function createContainerRuntime(
	context: ITestContainerContext,
): Promise<ContainerRuntime> {
	const containerRuntime = await ContainerRuntime.loadRuntime({
		context,
		registryEntries: [],
		existing: false,
		provideEntryPoint: async () => ({}),
	});
	return containerRuntime;
}

describe("ContainerRuntime Extensions", () => {
	describe("Extension isConnected behavior", () => {
		it("should return true when CONNECTED and canSendSignals is true", async () => {
			const context = createMockContext(true, ConnectionState.Connected);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(extension.isConnected, true, "Extension should be connected");
		});

		it("should return true when CATCHING_UP and canSendSignals is true", async () => {
			const context = createMockContext(true, ConnectionState.CatchingUp);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				true,
				"Extension should be connected during CatchingUp state",
			);
		});

		it("should return false when DISCONNECTED", async () => {
			const context = createMockContext(false, ConnectionState.Disconnected);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should not be connected when disconnected",
			);
		});

		it("should return false when ESTABLISHING_CONNECTION", async () => {
			const context = createMockContext(false, ConnectionState.EstablishingConnection);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should not be connected when establishing connection",
			);
		});

		it("should fallback to runtime.connected when canSendSignals is undefined", async () => {
			const context = createMockContext(undefined, ConnectionState.Connected);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				true,
				"Extension should fallback to runtime.connected when canSendSignals is undefined",
			);
		});
	});
});
