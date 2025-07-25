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
	ExtensionHostEvents,
	ExtensionRuntimeProperties,
} from "@fluidframework/container-runtime-definitions/internal";
import type { Listenable } from "@fluidframework/core-interfaces";
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

class TestExtension implements ContainerExtension<TestExtensionRuntimeProperties> {
	public readonly interface: {
		connectedToService: boolean;
		events: Listenable<ExtensionHostEvents>;
	};

	public readonly extension = this;

	constructor(host: ExtensionHost<TestExtensionRuntimeProperties>) {
		this.interface = {
			get connectedToService(): boolean {
				return host.canSendSignals() || host.canSendOps();
			},
			events: host.events,
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

class MockContext implements IContainerContext {
	constructor(private readonly container: MockContainer) {}

	public readonly attachState = AttachState.Attached;
	public readonly deltaManager = new MockDeltaManager();
	public readonly quorum = new MockQuorumClients();
	public readonly storage = {} as unknown as IContainerContext["storage"];
	public readonly baseSnapshot = undefined;
	public readonly options = {};
	public readonly loader = {} as unknown as IContainerContext["loader"];
	public readonly clientDetails = { capabilities: { interactive: true } };
	public readonly scope = {};
	public readonly id = "mockId";

	public get audience(): MockAudience {
		return this.container.audience;
	}
	public get clientId(): string | undefined {
		return this.container.audience.getSelf()?.clientId;
	}
	public get connected(): boolean {
		return this.container.connectionState === ConnectionState.Connected;
	}
	public get connectionState(): ConnectionState {
		return this.container.connectionState;
	}

	public updateDirtyContainerState = (): void => {};
	public getLoadedFromVersion = (): undefined => undefined;
	public submitBatchFn = (): number => 1;
	public submitSummaryFn = (): number => 1;
	public submitSignalFn = (): void => {};
	public submitFn = (): number => 1;
	public disposeFn = (): void => {};
	public closeFn = (): void => {};
	public taggedLogger = new MockLogger();
	public getAbsoluteUrl = async (): Promise<string> => "mockUrl";
}

class MockContainer {
	public readonly audience = new MockAudience();
	public connectionState: ConnectionState = ConnectionState.Disconnected;
	public runtime: ContainerRuntime | undefined;
	public context: IContainerContext | undefined;

	public constructor(public readonly: boolean = false) {}

	public get clientId(): string | undefined {
		return this.audience.getSelf()?.clientId;
	}

	public async initialize(): Promise<void> {
		this.context = new MockContext(this);
		this.runtime = await createContainerRuntime(this.context);
	}

	public setConnectionState(connectionState: ConnectionState, clientId?: string): void {
		this.connectionState = connectionState;
		if (clientId !== undefined) {
			this.audience.setCurrentClientId(clientId);
		}

		if (
			this.runtime &&
			(connectionState === ConnectionState.Connected ||
				connectionState === ConnectionState.Disconnected)
		) {
			this.runtime.setConnectionState(
				this.connectionState === ConnectionState.Connected && !this.readonly,
				this.clientId,
			);
		}
	}
}

async function createContainerRuntime(context: IContainerContext): Promise<ContainerRuntime> {
	const containerRuntime = await ContainerRuntime.loadRuntime({
		context,
		registryEntries: [],
		existing: false,
		provideEntryPoint: async () => ({}),
	});
	return containerRuntime;
}

describe("Container Extension", () => {
	let container: MockContainer;

	beforeEach(async () => {
		container = new MockContainer();
		await container.initialize();
	});

	describe("connected to service", () => {
		it("should return true when 'Connected'", async () => {
			container.setConnectionState(ConnectionState.Connected, "mockClientId");
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			assert.strictEqual(extension.connectedToService, true, "Extension should be connected");
		});

		it("should return true when 'CatchingUp'", async () => {
			container.setConnectionState(ConnectionState.CatchingUp, "mockClientId");
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should be connected during CatchingUp state",
			);
		});

		it("should return false when 'Disconnected'", async () => {
			container.setConnectionState(ConnectionState.Disconnected);
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should not be connected when disconnected",
			);
		});

		it("should return false when 'EstablishingConnection'", async () => {
			container.setConnectionState(ConnectionState.EstablishingConnection);
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should not be connected when establishing connection",
			);
		});

		it("should fallback to runtime.connected when connectionState is undefined and runtime is connected", async () => {
			// Create a container with undefined connection state behavior
			const containerWithUndefinedState = new MockContainer();
			await containerWithUndefinedState.initialize();

			// Override the context to return undefined connectionState
			assert(containerWithUndefinedState.context, "Context should be initialized");
			const context = containerWithUndefinedState.context;
			Object.defineProperty(context, "connectionState", {
				get: () => undefined,
			});

			containerWithUndefinedState.setConnectionState(
				ConnectionState.Connected,
				"mockClientId",
			);
			assert(containerWithUndefinedState.runtime, "Runtime should be initialized");
			const extension = containerWithUndefinedState.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should fallback to runtime.connected when connectionState is undefined",
			);
		});

		it("should fallback to runtime.connected when connectionState is undefined and runtime is disconnected", async () => {
			// Create a container with undefined connection state behavior
			const containerWithUndefinedState = new MockContainer();
			await containerWithUndefinedState.initialize();

			// Override the context to return undefined connectionState
			assert(containerWithUndefinedState.context, "Context should be initialized");
			const context = containerWithUndefinedState.context;
			Object.defineProperty(context, "connectionState", {
				get: () => undefined,
			});

			containerWithUndefinedState.setConnectionState(ConnectionState.Disconnected);
			assert(containerWithUndefinedState.runtime, "Runtime should be initialized");
			const extension = containerWithUndefinedState.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should fallback to runtime.connected when connectionState is undefined and runtime is disconnected",
			);
		});

		it("should handle dynamic connection state transitions - write client", async () => {
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			let connectCount = 0;
			let disconnectCount = 0;

			extension.events.on("connected", (clientId) => {
				connectCount += 1;
				assert.strictEqual(
					clientId,
					"mockClientId",
					"Extension should emit connected event with correct clientId",
				);
			});

			extension.events.on("disconnected", () => {
				disconnectCount += 1;
			});

			// Initially disconnected
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should initially be disconnected",
			);

			// Transition to EstablishingConnection
			container.setConnectionState(ConnectionState.EstablishingConnection);
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should remain disconnected during EstablishingConnection",
			);

			// Transition to CatchingUp
			container.setConnectionState(ConnectionState.CatchingUp, "mockClientId");
			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should be connected during CatchingUp",
			);

			// Transition to Connected
			container.setConnectionState(ConnectionState.Connected, "mockClientId");
			assert.strictEqual(connectCount, 1, "Extension should emit connected event once");
			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should be connected when fully Connected",
			);

			// Transition back to Disconnected
			container.setConnectionState(ConnectionState.Disconnected);
			assert.strictEqual(
				disconnectCount,
				1,
				"Extension should emit exactly one disconnected event",
			);
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should be disconnected after transition back to Disconnected",
			);
		});

		it("should handle dynamic connection state transitions - read client", async () => {
			// Create a read-only container
			const readOnlyContainer = new MockContainer(true /* readonly */);
			await readOnlyContainer.initialize();
			assert(readOnlyContainer.runtime, "Runtime should be initialized");
			const extension = readOnlyContainer.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			let connectCount = 0;
			let disconnectCount = 0;

			extension.events.on("connected", (clientId) => {
				connectCount += 1;
				assert.strictEqual(
					clientId,
					"mockClientId",
					"Extension should emit connected event with correct clientId",
				);
			});

			extension.events.on("disconnected", () => {
				disconnectCount += 1;
			});

			// Initially disconnected
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should initially be disconnected",
			);

			// Transition to EstablishingConnection
			readOnlyContainer.setConnectionState(ConnectionState.EstablishingConnection);
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should remain disconnected during EstablishingConnection",
			);

			// Transition to CatchingUp
			readOnlyContainer.setConnectionState(ConnectionState.CatchingUp, "mockClientId");
			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should be connected during CatchingUp",
			);

			// Transition to Connected
			readOnlyContainer.setConnectionState(ConnectionState.Connected, "mockClientId");
			assert.strictEqual(connectCount, 1, "Extension should emit connected event once");
			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should be connected when fully Connected",
			);

			// Transition back to Disconnected
			readOnlyContainer.setConnectionState(ConnectionState.Disconnected);
			assert.strictEqual(
				disconnectCount,
				1,
				"Extension should emit exactly one disconnected event",
			);
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should be disconnected after transition back to Disconnected",
			);
		});
	});
});
