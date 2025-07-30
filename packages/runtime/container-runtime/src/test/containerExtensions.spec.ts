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
				return host.getJoinedStatus() !== "disconnected";
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
	public readonly deltaManager = new MockDeltaManager();
	public readonly quorum = new MockQuorumClients();
	public readonly storage = {} as unknown as IContainerContext["storage"];
	public readonly baseSnapshot = undefined;
	public readonly options = {};
	public readonly loader = {} as unknown as IContainerContext["loader"];
	public readonly clientDetails = { capabilities: { interactive: true } };
	public readonly scope = {};
	public readonly id = "mockId";
	public readonly taggedLogger = new MockLogger();

	public readonly getConnectionState: () => ConnectionState;
	public readonly getClientId: () => string | undefined;
	public readonly getConnected: () => boolean;
	public readonly getAttachState: () => AttachState;
	public readonly getContainerDiagnosticId: () => string | undefined;

	public readonly updateDirtyContainerState = (): void => {};
	public readonly getLoadedFromVersion = (): undefined => undefined;
	public readonly submitBatchFn = (): number => 1;
	public readonly submitSummaryFn = (): number => 1;
	public readonly submitSignalFn = (): void => {};
	public readonly submitFn = (): number => 1;
	public readonly disposeFn = (): void => {};
	public readonly closeFn = (): void => {};
	public readonly getAbsoluteUrl = async (): Promise<string> => "mockUrl";

	constructor(private readonly container: MockContainer) {
		this.getConnectionState = () => this.container.connectionState;
		this.getClientId = () => this.container.audience.getSelf()?.clientId;
		this.getConnected = () => this.container.connectionState === ConnectionState.Connected;
		this.getAttachState = () => AttachState.Attached;
		this.getContainerDiagnosticId = () => "mockId";
	}

	public get audience(): MockAudience {
		return this.container.audience;
	}
	public get clientId(): string | undefined {
		return this.getClientId();
	}
	public get connected(): boolean {
		return this.getConnected();
	}
	public get attachState(): AttachState {
		return this.getAttachState();
	}
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

		it("should return false when 'CatchingUp'", async () => {
			container.setConnectionState(ConnectionState.CatchingUp);
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);

			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should be disconnected during CatchingUp state",
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
			// Override the context to return undefined connectionState
			Object.defineProperty(container.context, "getConnectionState", {
				value: () => undefined,
			});

			container.setConnectionState(ConnectionState.Connected, "mockClientId");
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
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
			// Override the context to return undefined connectionState
			Object.defineProperty(container.context, "getConnectionState", {
				value: () => undefined,
			});

			container.setConnectionState(ConnectionState.Disconnected);
			assert(container.runtime, "Runtime should be initialized");
			const extension = container.runtime.acquireExtension(
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

			const events: {
				type: "joined" | "disconnected";
				clientId?: string;
				canWrite?: boolean;
			}[] = [];

			extension.events.on(
				"joined",
				({ clientId, canWrite }: { clientId: string; canWrite: boolean }) => {
					events.push({ type: "joined", clientId, canWrite });
					assert.strictEqual(
						clientId,
						"mockClientId",
						"Extension should emit joined event with correct clientId",
					);
				},
			);

			extension.events.on("disconnected", () => {
				events.push({ type: "disconnected" });
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
				false,
				"Extension should be disconnected during CatchingUp",
			);

			// Transition to Connected
			container.setConnectionState(ConnectionState.Connected, "mockClientId");
			assert.strictEqual(events.length, 1, "Should have received one joined events");
			assert.deepStrictEqual(
				events[0],
				{ type: "joined", clientId: "mockClientId", canWrite: true },
				"First event should be joined for writing",
			);

			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should be connected when fully Connected",
			);

			// Transition back to Disconnected
			container.setConnectionState(ConnectionState.Disconnected);
			assert.strictEqual(events.length, 2, "Should have received two events total");
			assert.deepStrictEqual(
				events[1],
				{ type: "disconnected" },
				"Second event should be disconnected",
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

			const events: {
				type: "joined" | "disconnected";
				clientId?: string;
				canWrite?: boolean;
			}[] = [];

			extension.events.on(
				"joined",
				({ clientId, canWrite }: { clientId: string; canWrite: boolean }) => {
					events.push({ type: "joined", clientId, canWrite });
					if (canWrite) {
						assert.fail(
							"Extension should not emit joined event with canWrite=true for read-only client",
						);
					}
					assert.strictEqual(
						clientId,
						"mockClientId",
						"Extension should emit joined event with correct clientId",
					);
				},
			);

			extension.events.on("disconnected", () => {
				events.push({ type: "disconnected" });
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
				false,
				"Extension should be disconnected during CatchingUp",
			);

			// Transition to Connected
			readOnlyContainer.setConnectionState(ConnectionState.Connected, "mockClientId");
			assert.strictEqual(
				events.length,
				1,
				"Should have received one event: joined for reading only",
			);
			assert.deepStrictEqual(
				events[0],
				{ type: "joined", clientId: "mockClientId", canWrite: false },
				"Event should be joined for reading",
			);
			assert.strictEqual(
				extension.connectedToService,
				true,
				"Extension should be connected when fully Connected",
			);

			// Transition back to Disconnected
			readOnlyContainer.setConnectionState(ConnectionState.Disconnected);
			assert.strictEqual(events.length, 2, "Should have received two events total");
			assert.deepStrictEqual(
				events[1],
				{ type: "disconnected" },
				"Second event should be disconnected",
			);
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should be disconnected after transition back to Disconnected",
			);
		});
	});
});
