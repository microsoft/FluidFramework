/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	IChannelStorageService,
	type IChannelAttributes,
	type IFluidDataStoreRuntime,
	type IFluidDataStoreRuntimeEvents,
	IChannelServices,
	IDeltaConnection,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	ISummaryTreeWithStats,
	type IExperimentalIncrementalSummaryContext,
	type ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { IFluidSerializer } from "../serializer";
import { SharedObject } from "../sharedObject";

type Overridable<T> = T extends ((...args: any) => any) | string | number | undefined | null | []
	? T
	: {
			-readonly [P in keyof T]?: Overridable<T[P]>;
	  };

function createOverridableProxy<T extends object>(name: string, ...overrides: Overridable<T>[]) {
	return new Proxy<T>({} as any as T, {
		get: (_, p, r) => {
			for (const override of overrides) {
				if (p in override) {
					return Reflect.get(override, p, r);
				}
			}
			assert.fail(`No override for ${name}.${p.toString()}`);
		},
	});
}

function createTestSharedObject(
	overrides: Overridable<{
		id: string;
		runtime: IFluidDataStoreRuntime;
		attributes: IChannelAttributes;
		telemetryConfigPrefix: string;
		summarizeCore: (
			this: SharedObject,
			serializer: IFluidSerializer,
			telemetryContext?: ITelemetryContext | undefined,
			incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
		) => ISummaryTreeWithStats;
		loadCore: (this: SharedObject, services: IChannelStorageService) => Promise<void>;
		processCore: (
			this: SharedObject,

			message: ISequencedDocumentMessage,
			local: boolean,
			localOpMetadata: unknown,
		) => void;
		onDisconnect: (this: SharedObject) => void;
		applyStashedOp: (this: SharedObject, content: any) => unknown;
	}>,
) {
	class TestSharedObjects extends SharedObject {
		protected summarizeCore = overrides?.summarizeCore?.bind(this);
		protected loadCore = overrides?.loadCore?.bind(this);
		protected processCore = overrides?.processCore?.bind(this);
		protected onDisconnect = overrides?.onDisconnect?.bind(this);
		protected applyStashedOp = overrides?.applyStashedOp?.bind(this);
	}

	const runtime = overrides?.runtime ?? {};
	runtime.channelsRoutingContext ??= {
		absolutePath: "/",
		attachGraph: () => {},
		get IFluidHandleContext() {
			return this;
		},
		isAttached: false,
		resolveHandle: async () => ({ status: 500, mimeType: "error", value: "error" }),
	};
	runtime.IFluidHandleContext ??= runtime.channelsRoutingContext;

	runtime.logger ??= createChildLogger();

	const attributes = overrides?.attributes ?? {};

	attributes.type ??= "TestSharedObject";

	return {
		overrides,
		sharedObject: new TestSharedObjects(
			overrides?.id ?? Date.now().toString(),
			createOverridableProxy<IFluidDataStoreRuntime>(
				"runtime",
				runtime,
				new TypedEventEmitter<IFluidDataStoreRuntimeEvents>() as any as Overridable<IFluidDataStoreRuntime>,
			),
			createOverridableProxy<IChannelAttributes>("attributes", attributes),
			overrides?.telemetryConfigPrefix ?? "testSharedObject",
		),
	};
}

const attachStateAndConnectedMatrix = generatePairwiseOptions({
	connected: [true, false],
	attachState: [AttachState.Detached, AttachState.Attaching, AttachState.Attached],
});

describe("SharedObject attaching binding and connecting", () => {
	describe("shared object after creation", () => {
		attachStateAndConnectedMatrix.forEach(({ connected, attachState }) =>
			it(`!isAttached and !connected with runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, () => {
				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
					},
				});

				assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");
				assert.strictEqual(sharedObject.connected, false, "!connected");
			}),
		);

		it("!isAttached with detached transition to attach runtime", () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();

			let attachingEventRegistered = false;
			runtimeEvents.on("newListener", (event) => {
				attachingEventRegistered ||= event === "attaching";
			});

			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as any as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached as AttachState,
				},
			});

			assert.strictEqual(attachingEventRegistered, true, "attachingEventRegistered");

			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");
		});
	});

	describe("shared object after load", () => {
		attachStateAndConnectedMatrix.forEach(({ connected, attachState }) =>
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				let loaded = false;

				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
					},
					loadCore: async () => {
						loaded = true;
					},
				});

				let attachCalled = false;
				await sharedObject.load(
					createOverridableProxy<IChannelServices>("services", {
						objectStorage: createOverridableProxy("objectStorage"),
						deltaConnection: createOverridableProxy<IDeltaConnection>(
							"deltaConnection",
							{
								attach(handler) {
									attachCalled = true;
								},
								connected,
							},
						),
					}),
				);

				assert.strictEqual(loaded, true, "loaded");
				assert.strictEqual(attachCalled, true, "attachCalled");

				const isDetached = attachState === AttachState.Detached;

				assert.strictEqual(sharedObject.isAttached(), !isDetached, "isAttached");
				assert.strictEqual(sharedObject.connected, connected && !isDetached, "connected");
			}),
		);

		it("isAttached with detached transition to attach runtime", async () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();

			let attachingEventRegistered = false;
			runtimeEvents.on("newListener", (event) => {
				attachingEventRegistered ||= event === "attaching";
			});

			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as any as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached as AttachState,
					connected: true,
				},
				loadCore: async () => {},
			});

			await sharedObject.load(
				createOverridableProxy<IChannelServices>("services", {
					objectStorage: createOverridableProxy("objectStorage"),
					deltaConnection: createOverridableProxy<IDeltaConnection>("deltaConnection", {
						attach(handler) {},
						connected: overrides.runtime?.connected ?? false,
					}),
				}),
			);

			assert.strictEqual(attachingEventRegistered, true, "attachingEventRegistered");

			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(sharedObject.isAttached(), true, "isAttached");
		});
	});

	describe("shared object after connect", () => {
		attachStateAndConnectedMatrix.forEach(({ connected, attachState }) =>
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
					},
				});

				let attachCalled = false;
				sharedObject.connect(
					createOverridableProxy<IChannelServices>("services", {
						objectStorage: createOverridableProxy("objectStorage"),
						deltaConnection: createOverridableProxy<IDeltaConnection>(
							"deltaConnection",
							{
								attach(handler) {
									attachCalled = true;
								},
								connected,
							},
						),
					}),
				);

				assert.strictEqual(attachCalled, true, "attachCalled");

				const isDetached = attachState === AttachState.Detached;

				assert.strictEqual(sharedObject.isAttached(), !isDetached, "isAttached");
				assert.strictEqual(sharedObject.connected, connected && !isDetached, "connected");
			}),
		);

		it("isAttached with detached transition to attach runtime", async () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();

			let attachingEventRegistered = false;
			runtimeEvents.on("newListener", (event) => {
				attachingEventRegistered ||= event === "attaching";
			});

			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as any as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached as AttachState,
					connected: true,
				},
			});

			sharedObject.connect(
				createOverridableProxy<IChannelServices>("services", {
					objectStorage: createOverridableProxy("objectStorage"),
					deltaConnection: createOverridableProxy<IDeltaConnection>("deltaConnection", {
						attach(handler) {},
						connected: overrides.runtime?.connected ?? false,
					}),
				}),
			);

			assert.strictEqual(attachingEventRegistered, true, "attachingEventRegistered");

			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(sharedObject.isAttached(), true, "isAttached");
		});
	});

	describe("shared object after load and connect", () => {
		attachStateAndConnectedMatrix.forEach(({ connected, attachState }) =>
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				let loaded = false;

				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
					},
					loadCore: async () => {
						loaded = true;
					},
				});

				let attachCalled = false;
				await sharedObject.load(
					createOverridableProxy<IChannelServices>("services", {
						objectStorage: createOverridableProxy("objectStorage"),
						deltaConnection: createOverridableProxy<IDeltaConnection>(
							"deltaConnection",
							{
								attach(handler) {
									attachCalled = true;
								},
								connected,
							},
						),
					}),
				);

				sharedObject.connect(createOverridableProxy<IChannelServices>("services"));

				assert.strictEqual(loaded, true, "loaded");
				assert.strictEqual(attachCalled, true, "attachCalled");

				const isDetached = attachState === AttachState.Detached;

				assert.strictEqual(sharedObject.isAttached(), !isDetached, "isAttached");
				assert.strictEqual(sharedObject.connected, connected && !isDetached, "connected");
			}),
		);
	});

	describe("shared object after bindToContext", () => {
		attachStateAndConnectedMatrix.forEach(({ connected, attachState }) =>
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
						bindChannel: (channel) => {
							assert.strictEqual(channel, sharedObject, "channel");
						},
					},
				});

				sharedObject.bindToContext();

				assert.strictEqual(
					sharedObject.isAttached(),
					attachState !== AttachState.Detached,
					"isAttached",
				);
				assert.strictEqual(
					sharedObject.connected,
					connected && sharedObject.isAttached(),
					"connected",
				);
			}),
		);

		it("isAttached with detached transition to attach runtime", async () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();

			let attachingEventRegistered = false;
			runtimeEvents.on("newListener", (event) => {
				attachingEventRegistered ||= event === "attaching";
			});

			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as any as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached as AttachState,
					connected: true,
				},
				loadCore: async () => {},
			});

			await sharedObject.load(
				createOverridableProxy<IChannelServices>("services", {
					objectStorage: createOverridableProxy("objectStorage"),
					deltaConnection: createOverridableProxy<IDeltaConnection>("deltaConnection", {
						attach(handler) {},
						connected: overrides.runtime?.connected ?? false,
					}),
				}),
			);

			assert.strictEqual(attachingEventRegistered, true, "attachingEventRegistered");

			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(sharedObject.isAttached(), true, "isAttached");
		});
	});
});
