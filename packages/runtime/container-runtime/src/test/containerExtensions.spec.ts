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
	updateConnectionState: (state: ConnectionState) => void;
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

function createMockContext(
	connectionState: ConnectionState,
	defined: boolean = true,
): ITestContainerContext {
	let currentConnectionState = connectionState;

	const updateConnectionState = (newState: ConnectionState): void => {
		currentConnectionState = newState;
	};

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
		get connected() {
			return currentConnectionState === ConnectionState.Connected;
		},
		storage: {} as unknown as IContainerContext["storage"],
		baseSnapshot: undefined,
		options: {},
		loader: {} as unknown as IContainerContext["loader"],
		get connectionState(): ConnectionState | undefined {
			return defined ? currentConnectionState : undefined;
		},
		clientDetails: { capabilities: { interactive: true } },
		submitFn: (): number => 1,
		disposeFn: (): void => {},
		closeFn: (): void => {},
		taggedLogger: new MockLogger(),
		scope: {},
		getAbsoluteUrl: async (): Promise<string> => "mockUrl",
		id: "mockId",
		updateConnectionState,
	};
	return mockContext;
}

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

describe("Container Extension", () => {
	describe("isConnected", () => {
		it("should return true when 'Connected'", async () => {
			const context = createMockContext(ConnectionState.Connected);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(extension.isConnected, true, "Extension should be connected");
		});

		it("should return true when 'CatchingUp'", async () => {
			const context = createMockContext(ConnectionState.CatchingUp);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				true,
				"Extension should be connected during CatchingUp state",
			);
		});

		it("should return false when 'Disconnected'", async () => {
			const context = createMockContext(ConnectionState.Disconnected);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should not be connected when disconnected",
			);
		});

		it("should return false when 'EstablishingConnection'", async () => {
			const context = createMockContext(ConnectionState.EstablishingConnection);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should not be connected when establishing connection",
			);
		});

		it("should fallback to runtime.connected when connectionState is undefined and runtime is connected", async () => {
			const context = createMockContext(ConnectionState.Connected, false /* undefined */);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				true,
				"Extension should fallback to runtime.connected when connectionState is undefined",
			);
		});

		it("should fallback to runtime.connected when connectionState is undefined and runtime is disconnected", async () => {
			const context = createMockContext(ConnectionState.Disconnected, false /* undefined */);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should fallback to runtime.connected when connectionState is undefined and runtime is disconnected",
			);
		});

		it("should handle dynamic connection state transitions", async () => {
			const context = createMockContext(ConnectionState.Disconnected);
			const runtime = await createContainerRuntime(context);
			const extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);

			// Initially disconnected
			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should initially be disconnected",
			);

			// Transition to EstablishingConnection
			context.updateConnectionState(ConnectionState.EstablishingConnection);
			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should remain disconnected during EstablishingConnection",
			);

			// Transition to CatchingUp
			context.updateConnectionState(ConnectionState.CatchingUp);
			assert.strictEqual(
				extension.isConnected,
				true,
				"Extension should be connected during CatchingUp",
			);

			// Transition to Connected
			context.updateConnectionState(ConnectionState.Connected);
			assert.strictEqual(
				extension.isConnected,
				true,
				"Extension should be connected when fully Connected",
			);

			// Transition back to Disconnected
			context.updateConnectionState(ConnectionState.Disconnected);
			assert.strictEqual(
				extension.isConnected,
				false,
				"Extension should be disconnected after transition back to Disconnected",
			);
		});
	});
});
