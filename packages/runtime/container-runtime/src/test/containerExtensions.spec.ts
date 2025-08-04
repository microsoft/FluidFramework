/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-definitions/internal";
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

const testExtensionId: ContainerExtensionId = "test:extension";

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

	public readonly updateDirtyContainerState = (): void => {};
	public readonly getLoadedFromVersion = (): undefined => undefined;
	public readonly submitBatchFn = (): number => 1;
	public readonly submitSummaryFn = (): number => 1;
	public readonly submitSignalFn = (): void => {};
	public readonly submitFn = (): number => 1;
	public readonly disposeFn = (): void => {};
	public readonly closeFn = (): void => {};
	public readonly getAbsoluteUrl = async (): Promise<string> => "mockUrl";
	public readonly getConnectionState = (): ConnectionState => this.connectionState;

	public readonly audience = new MockAudience();

	// State for testing purposes
	private connectionState: ConnectionState = ConnectionState.Disconnected;
	public readonly isReadonly: boolean;

	constructor(isReadonly: boolean = false) {
		this.isReadonly = isReadonly;
	}

	public get clientId(): string | undefined {
		return this.audience.getSelf()?.clientId;
	}
	public get connected(): boolean {
		return this.connectionState === ConnectionState.Connected;
	}
	public get attachState(): AttachState {
		return AttachState.Attached;
	}

	public setConnectionState(connectionState: ConnectionState, clientId?: string): void {
		this.connectionState = connectionState;
		if (clientId !== undefined) {
			this.audience.setCurrentClientId(clientId);
		}
	}
}

async function createRuntimeWithMockContext(isReadonly: boolean = false): Promise<{
	runtime: ContainerRuntime;
	context: MockContext;
}> {
	const context = new MockContext(isReadonly);
	const runtime = await ContainerRuntime.loadRuntime({
		context,
		registryEntries: [],
		existing: false,
		provideEntryPoint: async () => ({}),
	});
	return { runtime, context };
}

function updateConnectionState(
	runtime: ContainerRuntime,
	context: MockContext,
	connectionState: ConnectionState,
	clientId?: string,
): void {
	context.setConnectionState(connectionState, clientId);

	if (
		connectionState === ConnectionState.Connected ||
		connectionState === ConnectionState.Disconnected
	) {
		runtime.setConnectionState(
			connectionState === ConnectionState.Connected && !context.isReadonly,
			context.clientId,
		);
	}
}

function setupExtensionEventListeners(extensionInterface: {
	connectedToService: boolean;
	events: Listenable<ExtensionHostEvents>;
}): {
	type: "joined" | "disconnected" | "connectionTypeChanged";
	clientId?: string;
	canWrite?: boolean;
}[] {
	const events: {
		type: "joined" | "disconnected" | "connectionTypeChanged";
		clientId?: string;
		canWrite?: boolean;
	}[] = [];

	extensionInterface.events.on(
		"joined",
		({ clientId, canWrite }: { clientId: string; canWrite: boolean }) => {
			events.push({ type: "joined", clientId, canWrite });
		},
	);

	extensionInterface.events.on("disconnected", () => {
		events.push({ type: "disconnected" });
	});

	extensionInterface.events.on("connectionTypeChanged", (canWrite: boolean) => {
		events.push({ type: "connectionTypeChanged", canWrite });
	});

	return events;
}

describe("Container Extension", () => {
	let runtime: ContainerRuntime;
	let context: MockContext;
	let extension: { connectedToService: boolean; events: Listenable<ExtensionHostEvents> };

	beforeEach(async () => {
		const setup = await createRuntimeWithMockContext();
		runtime = setup.runtime;
		context = setup.context;
		extension = runtime.acquireExtension(testExtensionId, TestExtensionFactory);
	});

	describe("connection status", () => {
		it("should return true when context is `Connected`", async () => {
			updateConnectionState(runtime, context, ConnectionState.Connected, "mockClientId");

			assert.strictEqual(extension.connectedToService, true, "Extension should be connected");
		});

		it("should return false when context is `CatchingUp`", async () => {
			updateConnectionState(runtime, context, ConnectionState.CatchingUp);

			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should be disconnected during CatchingUp state",
			);
		});

		it("should return false when context is `Disconnected`", async () => {
			updateConnectionState(runtime, context, ConnectionState.Disconnected);

			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should not be connected when disconnected",
			);
		});

		it("should return false when context is `EstablishingConnection`", async () => {
			updateConnectionState(runtime, context, ConnectionState.EstablishingConnection);

			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should not be connected when establishing connection",
			);
		});

		describe("fallback behavior when getConnectionState is undefined", () => {
			beforeEach(() => {
				// Remove the getConnectionState method to test fallback behavior
				Object.defineProperty(context, "getConnectionState", {
					value: undefined,
				});
			});

			it("should fallback to canSendOps when context is `Connected`", async () => {
				updateConnectionState(runtime, context, ConnectionState.Connected, "mockClientId");

				assert.strictEqual(
					extension.connectedToService,
					true,
					"Extension should fallback to runtime.connected when connectionState is undefined",
				);
			});

			it("should fallback to canSendOps when context is `Disconnected`", async () => {
				updateConnectionState(runtime, context, ConnectionState.Disconnected);

				assert.strictEqual(
					extension.connectedToService,
					false,
					"Extension should fallback to runtime.connected when connectionState is undefined and runtime is disconnected",
				);
			});
		});
	});

	describe("event handling", () => {
		let events: {
			type: "joined" | "disconnected" | "connectionTypeChanged";
			clientId?: string;
			canWrite?: boolean;
		}[];

		beforeEach(() => {
			events = setupExtensionEventListeners(extension);
		});

		it("should handle dynamic connection state transitions - write client", async () => {
			// Initially disconnected
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should initially be disconnected",
			);
			assert.strictEqual(events.length, 0, "Should have no events initially");

			// Transition to EstablishingConnection
			updateConnectionState(runtime, context, ConnectionState.EstablishingConnection);
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should remain disconnected during EstablishingConnection",
			);
			assert.strictEqual(
				events.length,
				0,
				"Should have no events during EstablishingConnection",
			);

			// Transition to CatchingUp
			updateConnectionState(runtime, context, ConnectionState.CatchingUp, "mockClientId");
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should be disconnected during CatchingUp",
			);
			assert.strictEqual(events.length, 0, "Should have no events during CatchingUp");

			// Transition to Connected
			updateConnectionState(runtime, context, ConnectionState.Connected, "mockClientId");
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
			updateConnectionState(runtime, context, ConnectionState.Disconnected);
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
			// Create a read-only runtime setup
			const readOnlySetup = await createRuntimeWithMockContext(true /* readonly */);
			const readOnlyRuntime = readOnlySetup.runtime;
			const readOnlyContext = readOnlySetup.context;

			const readOnlyExtension = readOnlyRuntime.acquireExtension(
				testExtensionId,
				TestExtensionFactory,
			);
			const readOnlyEvents = setupExtensionEventListeners(readOnlyExtension);

			// Initially disconnected
			assert.strictEqual(
				readOnlyExtension.connectedToService,
				false,
				"Extension should initially be disconnected",
			);
			assert.strictEqual(readOnlyEvents.length, 0, "Should have no events initially");

			// Transition to EstablishingConnection
			updateConnectionState(
				readOnlyRuntime,
				readOnlyContext,
				ConnectionState.EstablishingConnection,
			);
			assert.strictEqual(
				readOnlyExtension.connectedToService,
				false,
				"Extension should remain disconnected during EstablishingConnection",
			);
			assert.strictEqual(
				readOnlyEvents.length,
				0,
				"Should have no events during EstablishingConnection",
			);

			// Transition to CatchingUp
			updateConnectionState(
				readOnlyRuntime,
				readOnlyContext,
				ConnectionState.CatchingUp,
				"mockClientId",
			);
			assert.strictEqual(
				readOnlyExtension.connectedToService,
				false,
				"Extension should be disconnected during CatchingUp",
			);
			assert.strictEqual(readOnlyEvents.length, 0, "Should have no events during CatchingUp");

			// Transition to Connected
			updateConnectionState(
				readOnlyRuntime,
				readOnlyContext,
				ConnectionState.Connected,
				"mockClientId",
			);
			assert.strictEqual(
				readOnlyEvents.length,
				1,
				"Should have received one event: joined for reading only",
			);
			assert.deepStrictEqual(
				readOnlyEvents[0],
				{ type: "joined", clientId: "mockClientId", canWrite: false },
				"Event should be joined for reading",
			);
			assert.strictEqual(
				readOnlyExtension.connectedToService,
				true,
				"Extension should be connected when fully Connected",
			);

			// Transition back to Disconnected
			updateConnectionState(readOnlyRuntime, readOnlyContext, ConnectionState.Disconnected);
			assert.strictEqual(readOnlyEvents.length, 2, "Should have received two events total");
			assert.deepStrictEqual(
				readOnlyEvents[1],
				{ type: "disconnected" },
				"Second event should be disconnected",
			);
			assert.strictEqual(
				readOnlyExtension.connectedToService,
				false,
				"Extension should be disconnected after transition back to Disconnected",
			);
		});

		it("should handle connection type changes", async () => {
			updateConnectionState(runtime, context, ConnectionState.Connected, "mockClientId");

			// Should have initial joined event
			assert.strictEqual(events.length, 1, "Should have received initial joined event");
			assert.deepStrictEqual(
				events[0],
				{ type: "joined", clientId: "mockClientId", canWrite: true },
				"Initial event should be joined with write access",
			);

			// Force readonly mode and reconnect
			runtime.setConnectionState(false, context.clientId);
			updateConnectionState(runtime, context, ConnectionState.Connected, "newMockClientId");

			assert.strictEqual(
				events.length,
				3,
				"Should have received three events total: joined + two connectionTypeChanged",
			);
			assert.deepStrictEqual(
				events[1],
				{ type: "connectionTypeChanged", canWrite: false },
				"Second event should indicate connection type changed to read-only",
			);
			assert.deepStrictEqual(
				events[2],
				{ type: "connectionTypeChanged", canWrite: true },
				"Third event should indicate connection type changed to writable",
			);
		});

		it("should still emit joined and disconnected events when getConnectionState is undefined", async () => {
			// Remove the getConnectionState method to test fallback behavior
			Object.defineProperty(context, "getConnectionState", {
				value: undefined,
			});

			// Connect
			updateConnectionState(runtime, context, ConnectionState.Connected, "mockClientId");
			assert.strictEqual(extension.connectedToService, true, "Extension should be connected");
			assert.strictEqual(events.length, 1, "Should have received one joined event");
			assert.deepStrictEqual(
				events[0],
				{ type: "joined", clientId: "mockClientId", canWrite: true },
				"Event should be joined with canWrite = true when getConnectionState is undefined",
			);

			// Disconnect
			updateConnectionState(runtime, context, ConnectionState.Disconnected);
			assert.strictEqual(
				extension.connectedToService,
				false,
				"Extension should be disconnected",
			);
			assert.strictEqual(events.length, 2, "Should have received two events total");
			assert.deepStrictEqual(
				events[1],
				{ type: "disconnected" },
				"Second event should be disconnected",
			);
		});
	});
});
