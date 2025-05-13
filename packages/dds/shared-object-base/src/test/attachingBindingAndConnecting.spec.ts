/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { AttachState } from "@fluidframework/container-definitions";
import {
	type IChannelAttributes,
	type IFluidDataStoreRuntime,
	type IFluidDataStoreRuntimeEvents,
	IChannelServices,
	IChannelStorageService,
	IDeltaConnection,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	type IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	type ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { IFluidSerializer } from "../serializer.js";
import { SharedObject } from "../sharedObject.js";

/* eslint-disable-next-line @typescript-eslint/ban-types --
	Trying to use specific function signatures here instead of Function makes it so some of the properties of
	OverridableType below (summarizeCore, loadCore, processCore) end up not typed correctly */
type Overridable<T> = T extends Function | string | number | undefined | []
	? T
	: {
			-readonly [P in keyof T]?: Overridable<T[P]>;
		};

function createOverridableProxy<T extends object>(
	name: string,
	...overrides: Overridable<T>[]
): T {
	return new Proxy<T>({} as unknown as T, {
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

type OverridableType = Overridable<{
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
	applyStashedOp: (this: SharedObject, content: unknown) => void;
	didAttach: () => void;
}>;

function createTestSharedObject(overrides: OverridableType): {
	overrides: OverridableType;
	sharedObject: SharedObject;
} {
	class TestSharedObject extends SharedObject {
		protected summarizeCore = overrides?.summarizeCore?.bind(this);
		protected loadCore = overrides?.loadCore?.bind(this);
		protected processCore = overrides?.processCore?.bind(this);
		protected onDisconnect = overrides?.onDisconnect?.bind(this);
		protected applyStashedOp = overrides?.applyStashedOp?.bind(this);
		protected didAttach =
			overrides.didAttach?.bind(this) ?? (() => assert.fail("didAttach not set"));
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
		sharedObject: new TestSharedObject(
			overrides?.id ?? "testSharedObject",
			createOverridableProxy<IFluidDataStoreRuntime>(
				"runtime",
				runtime,
				new TypedEventEmitter<IFluidDataStoreRuntimeEvents>() as unknown as Overridable<IFluidDataStoreRuntime>,
			),
			createOverridableProxy<IChannelAttributes>("attributes", attributes),
			overrides?.telemetryConfigPrefix ?? "testSharedObject",
		),
	};
}

/**
 * The attach state of a shared object is determined by two facts:
 *
 * * Is it bound to a context which means its handle is stored in an already bound dds
 * * Is the runtime attached
 *
 * If both of these are true, then the dds should be considered attached.
 *
 * Beyond attach, there is also the connected state, and the didAttach method.
 * The connected state should always be false while detached, and didAttach should only be called once when the dds transitions.
 *
 * These tests valid these properties across all the functions that can cause attach state transitions
 */
describe("SharedObject attaching binding and connecting", () => {
	const runtimeAttachStateAndConnectedMatrix = generatePairwiseOptions({
		connected: [true, false],
		attachState: [AttachState.Detached, AttachState.Attaching, AttachState.Attached],
	});

	describe("shared object after creation", () => {
		for (const { connected, attachState } of runtimeAttachStateAndConnectedMatrix) {
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
			});
		}

		it("!isAttached with detached transition to attach runtime", () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();

			let didAttach = 0;
			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as unknown as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached,
				},
				didAttach: () => didAttach++,
			});

			assert.strictEqual(didAttach, 0, "!didAttach");
			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");
			assert.strictEqual(didAttach, 0, "!didAttach");
		});
	});

	describe("shared object after load", () => {
		for (const { connected, attachState } of runtimeAttachStateAndConnectedMatrix) {
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				let loaded = false;
				let didAttach = 0;
				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
					},
					loadCore: async () => {
						loaded = true;
					},
					didAttach: () => didAttach++,
				});

				let attachCalled = false;
				await sharedObject.load(
					createOverridableProxy<IChannelServices>("services", {
						objectStorage: createOverridableProxy("objectStorage"),
						deltaConnection: createOverridableProxy<IDeltaConnection>("deltaConnection", {
							attach(handler) {
								attachCalled = true;
							},
							connected,
						}),
					}),
				);

				assert.strictEqual(loaded, true, "loaded");
				assert.strictEqual(attachCalled, true, "attachCalled");
				assert.strictEqual(didAttach, sharedObject.isAttached() ? 1 : 0, "didAttach");

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
			});
		}

		it("isAttached with detached transition to attach runtime", async () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();

			let didAttach = 0;
			let loaded = false;
			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as unknown as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached,
					connected: true,
				},
				didAttach: () => didAttach++,
				loadCore: async () => {
					loaded = true;
				},
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

			assert.strictEqual(didAttach, 0, "!didAttach");
			assert.strictEqual(loaded, true, "loaded");
			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(sharedObject.isAttached(), true, "isAttached");
			assert.strictEqual(didAttach, 1, "didAttach");
		});
	});

	describe("shared object after connect", () => {
		for (const { connected, attachState } of runtimeAttachStateAndConnectedMatrix) {
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				let didAttach = 0;
				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
					},
					didAttach: () => didAttach++,
				});

				let attachCalled = false;
				sharedObject.connect(
					createOverridableProxy<IChannelServices>("services", {
						objectStorage: createOverridableProxy("objectStorage"),
						deltaConnection: createOverridableProxy<IDeltaConnection>("deltaConnection", {
							attach(handler) {
								attachCalled = true;
							},
							connected,
						}),
					}),
				);

				assert.strictEqual(attachCalled, true, "attachCalled");
				assert.strictEqual(didAttach, sharedObject.isAttached() ? 1 : 0, "didAttach");

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
			});
		}

		it("isAttached with detached transition to attach runtime", async () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();

			let didAttach = 0;
			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as unknown as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached,
					connected: true,
				},
				didAttach: () => didAttach++,
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

			assert.strictEqual(didAttach, 0, "!didAttach");

			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(sharedObject.isAttached(), true, "isAttached");
			assert.strictEqual(didAttach, 1, "didAttach");
		});
	});

	describe("shared object after load and connect", () => {
		for (const { connected, attachState } of runtimeAttachStateAndConnectedMatrix) {
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				let loaded = false;
				let didAttach = 0;
				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
					},
					didAttach: () => didAttach++,
					loadCore: async () => {
						loaded = true;
					},
				});

				let attachCalled = false;
				await sharedObject.load(
					createOverridableProxy<IChannelServices>("services", {
						objectStorage: createOverridableProxy("objectStorage"),
						deltaConnection: createOverridableProxy<IDeltaConnection>("deltaConnection", {
							attach(handler) {
								attachCalled = true;
							},
							connected,
						}),
					}),
				);

				assert.strictEqual(loaded, true, "loaded");
				assert.strictEqual(attachCalled, true, "attachCalled");
				assert.strictEqual(didAttach, sharedObject.isAttached() ? 1 : 0, "didAttach");

				sharedObject.connect(createOverridableProxy<IChannelServices>("services"));

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
			});
		}
	});

	describe("shared object after bindToContext", () => {
		for (const { connected, attachState } of runtimeAttachStateAndConnectedMatrix) {
			it(`With runtime ${JSON.stringify({
				connected,
				attachState,
			})}`, async () => {
				let didAttach = 0;
				let attachCalled = false;
				const { sharedObject } = createTestSharedObject({
					runtime: {
						attachState,
						connected,
						bindChannel: (channel) => {
							assert.strictEqual(channel, sharedObject, "channel");
							// real bind to context calls connect, so simulate here
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
						},
					},
					didAttach: () => didAttach++,
				});

				sharedObject.bindToContext();
				assert.strictEqual(didAttach, sharedObject.isAttached() ? 1 : 0, "didAttach");
				assert.strictEqual(attachCalled, true, "attachCalled");

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
			});
		}

		it("isAttached with detached transition to attach runtime", async () => {
			const runtimeEvents = new TypedEventEmitter<IFluidDataStoreRuntimeEvents>();
			let didAttach = 0;
			let attachCalled = false;
			const { overrides, sharedObject } = createTestSharedObject({
				runtime: {
					...(runtimeEvents as unknown as Overridable<IFluidDataStoreRuntime>),
					attachState: AttachState.Detached,
					connected: false,
					bindChannel: (channel) => {
						assert.strictEqual(channel, sharedObject, "channel");
						// real bind to context calls connect, so simulate here
						sharedObject.connect(
							createOverridableProxy<IChannelServices>("services", {
								objectStorage: createOverridableProxy("objectStorage"),
								deltaConnection: createOverridableProxy<IDeltaConnection>("deltaConnection", {
									attach(handler) {
										attachCalled = true;
									},
									connected: false,
								}),
							}),
						);
					},
				},
				didAttach: () => didAttach++,
			});

			sharedObject.bindToContext();

			assert.strictEqual(didAttach, 0, "!didAttach");
			assert.strictEqual(attachCalled, true, "attachCalled");
			assert.strictEqual(sharedObject.isAttached(), false, "!isAttached");

			assert(overrides.runtime);
			overrides.runtime.attachState = AttachState.Attaching;
			runtimeEvents.emit("attaching");
			overrides.runtime.attachState = AttachState.Attached;

			assert.strictEqual(didAttach, 1, "didAttach");
			assert.strictEqual(sharedObject.isAttached(), true, "isAttached");
		});
	});
});
