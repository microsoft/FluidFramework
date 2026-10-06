/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	type ISequencedDocumentMessage,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import type {
	IGarbageCollectionData,
	IRuntimeMessageCollection,
	IRuntimeStorageService,
	ISummarizerNodeWithGC,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { DataProcessingError } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreContext,
	MockFluidDataStoreRuntime,
	MockStorage,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";
import { timeoutAwait } from "@fluidframework/test-runtime-utils/internal/timeoutUtils";

import type { ChannelConfigurationMessageV1 } from "../channelConfigurationFormat.js";
import {
	type ChannelConfigurationDefinition,
	type ChannelConfigurationFacet,
	FluidSerializer,
	type IFluidSerializer,
	SharedObject,
	type SharedObjectConfigurationInitialization,
	type SharedObjectConfigurationOptions,
	SharedObjectCore,
	createSingleBlobSummary,
	initializeSharedObjectConfiguration,
} from "../index.js";

type Config = Readonly<{ retain?: boolean }>;

const definition: ChannelConfigurationDefinition<Config> = {
	defaultConfiguration: { retain: false },
	validateTransition: (_previous, next): asserts next is Config => {
		assert(
			Object.keys(next).every((key) => key === "retain") &&
				(next.retain === undefined || typeof next.retain === "boolean"),
			"Unsupported channel configuration values",
		);
	},
};

interface ConfiguredObject extends SharedObjectCore {
	readonly config: ChannelConfigurationFacet<Config>;
	readonly observed: unknown[];
	edit(contents: unknown, metadata?: unknown): void;
}

interface Hooks {
	beforeConfiguration?: (shared: SharedObjectCore) => void;
	constructed?: (shared: ConfiguredObject) => void;
	initialize?: (shared: ConfiguredObject) => void;
	load?: (shared: ConfiguredObject) => Promise<void>;
	attach?: () => void;
}

function observeConstruction(shared: ConfiguredObject, hooks: Hooks): void {
	shared.observed.push(["constructor", shared.config.current]);
	shared.config.on("changed", (change) => {
		assert("configuration" in shared.attributes);
		shared.observed.push(["configuration", change]);
	});
	for (const event of ["pre-op", "op"] as const) {
		shared.on(event, (message: ISequencedDocumentMessage, local: boolean) => {
			shared.observed.push([event, message.contents, shared.config.current, local]);
		});
	}
	hooks.constructed?.(shared);
}

function observeMessages(shared: ConfiguredObject, messages: IRuntimeMessageCollection): void {
	for (const message of messages.messagesContent) {
		shared.observed.push([
			"process",
			message.contents,
			shared.config.current,
			messages.local,
			message.localOpMetadata,
		]);
	}
}

class ConfiguredSharedObject extends SharedObject implements ConfiguredObject {
	public readonly config: ChannelConfigurationFacet<Config>;
	public readonly observed: unknown[] = [];
	readonly #hooks: Hooks;

	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		attributes: IChannelAttributes,
		options: SharedObjectConfigurationOptions<Config>,
		hooks: Hooks = {},
	) {
		super(id, runtime, attributes, "configured-test");
		this.#hooks = hooks;
		hooks.beforeConfiguration?.(this);
		this.config = initializeSharedObjectConfiguration(this, options);
		observeConstruction(this, hooks);
	}

	public edit(contents: unknown, metadata?: unknown): void {
		this.submitLocalMessage(contents, metadata);
	}

	protected override initializeLocalCore(): void {
		this.observed.push(["initialize", this.config?.current]);
		this.#hooks.initialize?.(this);
	}

	protected async loadCore(): Promise<void> {
		this.observed.push(["load", this.config?.current]);
		await this.#hooks.load?.(this);
	}

	protected summarizeCore(): ISummaryTreeWithStats {
		return createSingleBlobSummary("data", JSON.stringify(this.observed));
	}

	protected override didAttach(): void {
		this.#hooks.attach?.();
	}

	protected processMessagesCore(messages: IRuntimeMessageCollection): void {
		observeMessages(this, messages);
	}

	protected onDisconnect(): void {}

	protected applyStashedOp(contents: unknown): void {
		this.edit(contents);
	}

	protected override rollback(contents: unknown, metadata: unknown): void {
		this.edit({ rollback: contents }, metadata);
	}
}

class ConfiguredSharedObjectCore extends SharedObjectCore implements ConfiguredObject {
	public readonly config: ChannelConfigurationFacet<Config>;
	public readonly observed: unknown[] = [];
	readonly #hooks: Hooks;

	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		attributes: IChannelAttributes,
		options: SharedObjectConfigurationOptions<Config>,
		hooks: Hooks = {},
	) {
		super(id, runtime, attributes);
		this.#hooks = hooks;
		hooks.beforeConfiguration?.(this);
		this.config = initializeSharedObjectConfiguration(this, options);
		observeConstruction(this, hooks);
	}

	public edit(contents: unknown, metadata?: unknown): void {
		this.submitLocalMessage(contents, metadata);
	}

	public getAttachSummary(): ISummaryTreeWithStats {
		return createSingleBlobSummary("attach", JSON.stringify(this.observed));
	}

	public async summarize(): Promise<ISummaryTreeWithStats> {
		await Promise.resolve();
		return createSingleBlobSummary("async", JSON.stringify(this.observed));
	}

	public getGCData(): IGarbageCollectionData {
		return { gcNodes: { "/": [] } };
	}

	protected get serializer(): IFluidSerializer {
		return new FluidSerializer(this.runtime.channelsRoutingContext);
	}

	protected override initializeLocalCore(): void {
		this.observed.push(["initialize", this.config?.current]);
		this.#hooks.initialize?.(this);
	}

	protected async loadCore(): Promise<void> {
		this.observed.push(["load", this.config?.current]);
		await this.#hooks.load?.(this);
	}

	protected override didAttach(): void {
		this.#hooks.attach?.();
	}

	protected processMessagesCore(messages: IRuntimeMessageCollection): void {
		observeMessages(this, messages);
	}

	protected onDisconnect(): void {}

	protected applyStashedOp(contents: unknown): void {
		this.edit(contents);
	}

	protected override rollback(contents: unknown, metadata: unknown): void {
		this.edit({ rollback: contents }, metadata);
	}
}

function harness(attachState: AttachState = AttachState.Attached): {
	runtime: MockFluidDataStoreRuntime;
	delta: MockDeltaConnection;
	services: IChannelServices;
	submitted: { contents: unknown; metadata: unknown }[];
	readonly dirty: number;
} {
	const runtime = new MockFluidDataStoreRuntime({ attachState });
	const submitted: { contents: unknown; metadata: unknown }[] = [];
	let dirty = 0;
	const delta = new MockDeltaConnection(
		(contents, metadata) => submitted.push({ contents, metadata }),
		() => dirty++,
	);
	return {
		runtime,
		delta,
		services: { deltaConnection: delta, objectStorage: new MockStorage() },
		submitted,
		get dirty() {
			return dirty;
		},
	};
}

function collection(
	contents: readonly unknown[],
	local: boolean = false,
	metadata: readonly unknown[] = [],
): IRuntimeMessageCollection {
	return {
		envelope: {
			clientId: "client",
			sequenceNumber: 10,
			referenceSequenceNumber: 0,
			minimumSequenceNumber: 0,
			timestamp: 0,
			type: MessageType.Operation,
		},
		local,
		messagesContent: contents.map((content, index) => ({
			contents: content,
			clientSequenceNumber: index + 1,
			localOpMetadata: metadata[index],
		})),
	};
}

function barrier(expectedRevision: number, retain: boolean): ChannelConfigurationMessageV1 {
	return { version: 1, isChannelConfigurationOp: true, expectedRevision, values: { retain } };
}

function roundTripAttributes(shared: SharedObjectCore): IChannelAttributes {
	// eslint-disable-next-line unicorn/prefer-structured-clone -- Exercise persisted JSON encoding.
	return JSON.parse(JSON.stringify(shared.attributes)) as IChannelAttributes;
}

for (const Class of [ConfiguredSharedObject, ConfiguredSharedObjectCore]) {
	describe(`${Class.name} configuration opt-in`, () => {
		function factory(
			initialConfiguration?: Config,
			hooks: Hooks = {},
		): IChannelFactory<ConfiguredObject> & {
			readonly channelConfigurationProtocolVersion: 1;
		} {
			const attributes: IChannelAttributes = {
				type: "configured-inheritance-test",
				snapshotFormatVersion: "1",
				packageVersion: "1",
			};
			return {
				type: attributes.type,
				attributes,
				channelConfigurationProtocolVersion: 1,
				create: (runtime, id) => {
					const initialization: SharedObjectConfigurationInitialization<Config> = {
						kind: "create",
						...(initialConfiguration === undefined ? {} : { initialConfiguration }),
					};
					const shared = new Class(
						runtime,
						id,
						attributes,
						{ definition, initialization },
						hooks,
					);
					shared.initializeLocal();
					return shared;
				},
				load: async (runtime, id, services, loadedAttributes) => {
					const shared = new Class(
						runtime,
						id,
						loadedAttributes,
						{ definition, initialization: { kind: "load" } },
						hooks,
					);
					await shared.load(services);
					return shared;
				},
			};
		}

		it("exposes typed defaults before local initialization without marking summaries", async () => {
			const { runtime } = harness(AttachState.Detached);
			const reader = factory();
			const shared = reader.create(runtime, "defaults");
			const current = { revision: 0, values: { retain: false } };
			assert.deepEqual(shared.config.current, current);
			assert.deepEqual(shared.observed, [
				["constructor", current],
				["initialize", current],
			]);
			assert.equal(
				(shared as ConfiguredObject & { channelConfigurationProtocolVersion: number })
					.channelConfigurationProtocolVersion,
				1,
			);
			assert(!("configuration" in shared));
			assert.notEqual(shared.attributes, reader.attributes);
			assert.deepEqual(shared.attributes, reader.attributes);
			assert(!("configuration" in shared.attributes));
			shared.getAttachSummary();
			await shared.summarize();
			assert.deepEqual(shared.getGCData(), { gcNodes: { "/": [] } });
			assert(!("configuration" in roundTripAttributes(shared)));
			assert(!("configuration" in reader.attributes));
			if (shared instanceof ConfiguredSharedObjectCore) {
				assert(!(shared instanceof SharedObject));
				assert("attach" in shared.getAttachSummary().summary.tree);
				const summary = await shared.summarize();
				assert("async" in summary.summary.tree);
			}
		});

		for (const initialConfiguration of [{}, { retain: true }]) {
			it(`persists explicit create values ${JSON.stringify(initialConfiguration)} without changing factory attributes`, () => {
				const { runtime } = harness(AttachState.Detached);
				const reader = factory(initialConfiguration);
				const shared = reader.create(runtime, "initial");
				assert.deepEqual(shared.observed, [
					["constructor", { revision: 0, values: initialConfiguration }],
					["initialize", { revision: 0, values: initialConfiguration }],
				]);
				assert.deepEqual(roundTripAttributes(shared), {
					...reader.attributes,
					configuration: { version: 1, revision: 0, values: initialConfiguration },
				});
				assert(!("configuration" in reader.attributes));
			});
		}

		it("loads persisted instance values before loadCore rather than creation settings", async () => {
			const { runtime, services } = harness();
			const reader = factory({ retain: false });
			const attributes = {
				...reader.attributes,
				configuration: { version: 1, revision: 7, values: { retain: true } },
			};
			const shared = await reader.load(runtime, "loaded", services, attributes);
			const current = { revision: 7, values: { retain: true } };
			assert.deepEqual(shared.observed, [
				["constructor", current],
				["load", current],
			]);
			assert.deepEqual(roundTripAttributes(shared), attributes);
			assert.notEqual(shared.attributes, attributes);
			assert(!("configuration" in reader.attributes));
		});

		it("loads unmarked attributes with definition defaults even when new instances opt in", async () => {
			const { runtime, services } = harness();
			const reader = factory({ retain: true });
			const shared = await reader.load(runtime, "legacy", services, reader.attributes);
			const current = { revision: 0, values: { retain: false } };
			assert.deepEqual(shared.observed, [
				["constructor", current],
				["load", current],
			]);
			assert.deepEqual(shared.config.current, current);
			assert(!("configuration" in shared.attributes));
			assert.equal(reader.create(runtime, "new").config.current.values.retain, true);
		});

		it("loads defaults if an older summarizer omits persisted configuration", async () => {
			const { runtime, services } = harness(AttachState.Detached);
			const reader = factory({ retain: true });
			const original = reader.create(runtime, "original");
			await original.config.requestChange({ retain: true });
			const attributes = roundTripAttributes(original);
			assert("configuration" in attributes);
			assert.equal(original.config.current.revision, 1);
			delete attributes.configuration;
			const loaded = await reader.load(runtime, "reloaded", services, attributes);
			assert.deepEqual(loaded.config.current, {
				revision: 0,
				values: definition.defaultConfiguration,
			});
			assert(!("configuration" in loaded.attributes));
			assert(!("configuration" in roundTripAttributes(loaded)));
		});

		it("activates only accepted control ops and preserves exact ordinary event order", async () => {
			const { runtime, services, delta } = harness();
			const reader = factory();
			const shared = await reader.load(runtime, "loaded", services, reader.attributes);
			assert(!("configuration" in shared.attributes));
			shared.observed.length = 0;
			const before = { revision: 0, values: { retain: false } };
			const after = { revision: 1, values: { retain: true } };
			delta.processMessages(collection(["before", barrier(0, true), "after"]));
			assert.deepEqual(shared.observed, [
				["pre-op", "before", before, false],
				["process", "before", before, false, undefined],
				["op", "before", before, false],
				[
					"configuration",
					{
						previous: before,
						current: after,
						source: "sequenced",
						sequenceNumber: 10,
						clientSequenceNumber: 2,
						messageIndex: 1,
						local: false,
					},
				],
				["pre-op", "after", after, false],
				["process", "after", after, false, undefined],
				["op", "after", after, false],
			]);
			assert.deepEqual(roundTripAttributes(shared), {
				...reader.attributes,
				configuration: { version: 1, ...after },
			});
			delta.processMessages(collection([barrier(0, false)]));
			assert.deepEqual(shared.config.current, after);
			assert.equal(shared.observed.length, 7);
			assert(!("configuration" in reader.attributes));
		});

		it("applies detached replacements synchronously and reloads updated serialized attributes", async () => {
			const { runtime, services, submitted } = harness(AttachState.Detached);
			const reader = factory();
			const shared = reader.create(runtime, "original");
			const other = reader.create(runtime, "other");
			shared.connect(services);
			shared.getAttachSummary();
			const unmarked = roundTripAttributes(shared);
			const first = shared.config.requestChange({ retain: false });
			assert.deepEqual(shared.config.current, {
				revision: 1,
				values: { retain: false },
			});
			assert("configuration" in shared.attributes);
			const firstResult = await first;
			assert.equal(firstResult.source, "local");
			await shared.config.requestChange({ retain: true });
			const persisted = roundTripAttributes(shared);
			const rehydrated = harness(AttachState.Detached);
			const loaded = await reader.load(
				rehydrated.runtime,
				"rehydrated",
				rehydrated.services,
				persisted,
			);
			assert.deepEqual(loaded.config.current, {
				revision: 2,
				values: { retain: true },
			});
			await loaded.config.requestChange({});
			assert.equal(loaded.config.current.revision, 3);
			assert.deepEqual(persisted, roundTripAttributes(shared));
			assert(!("configuration" in unmarked));
			assert(!("configuration" in reader.attributes));
			assert(!("configuration" in other.attributes));
			assert.equal(other.config.current.revision, 0);
			assert.deepEqual(submitted, []);
			assert.deepEqual(rehydrated.submitted, []);
		});

		it("waits for attached acknowledgements, preserves CAS, and leaves ordinary ops unwrapped", async () => {
			const { runtime, services, submitted, delta } = harness();
			const shared = factory().create(runtime, "attached");
			shared.connect(services);
			const first = shared.config.requestChange({ retain: true });
			const second = shared.config.requestChange({});
			const ordinary = { edit: "ordinary" };
			const metadata = { id: "metadata" };
			shared.edit(ordinary, metadata);
			assert.equal(shared.config.current.revision, 0);
			assert(!("configuration" in shared.attributes));
			assert.equal(submitted.length, 3);
			assert.deepEqual(submitted[0]?.contents, barrier(0, true));
			assert.deepEqual(submitted[2], { contents: ordinary, metadata });
			let completed = false;
			const completion = first.then(() => {
				completed = true;
			});
			await Promise.resolve();
			assert.equal(completed, false);
			delta.processMessages(
				collection(
					submitted.map((message) => message.contents),
					true,
					submitted.map((message) => message.metadata),
				),
			);
			const firstResult = await first;
			const secondResult = await second;
			await completion;
			assert.equal(firstResult.status, "applied");
			assert.equal(secondResult.status, "conflict");
			assert.deepEqual(shared.config.current, { revision: 1, values: { retain: true } });
			assert.deepEqual(shared.observed.slice(-3), [
				["pre-op", ordinary, shared.config.current, true],
				["process", ordinary, shared.config.current, true, metadata],
				["op", ordinary, shared.config.current, true],
			]);
		});

		for (const attachState of [AttachState.Detached, AttachState.Attached]) {
			it(`calls a no-super didAttach override without a document capability (${attachState})`, () => {
				const { runtime, services } = harness(attachState);
				let attached = false;
				const shared = factory({ retain: true }, { attach: () => (attached = true) }).create(
					runtime,
					"configured",
				);
				if (attachState === AttachState.Detached) {
					shared.connect(services);
					assert.equal(attached, false);
					runtime.setAttachState(AttachState.Attaching);
				} else {
					shared.connect(services);
				}
				assert.equal(attached, true);
			});
		}

		it("rejects malformed or unsupported attributes, including an own undefined marker", async () => {
			let constructed = false;
			const reader = factory(undefined, { constructed: () => (constructed = true) });
			for (const configuration of [
				undefined,
				// eslint-disable-next-line unicorn/no-null -- Test an invalid persisted JSON value.
				null,
				{ version: 2, revision: 0, values: {} },
				{ version: 1, revision: -1, values: {} },
				{ version: 1, revision: 0, values: [] },
				{ version: 1, revision: 0, values: { retain: "invalid" } },
				{ version: 1, revision: 0, values: { unknown: true } },
			]) {
				const { runtime, services } = harness();
				const attributes: IChannelAttributes & { configuration: unknown } = {
					...reader.attributes,
					configuration,
				};
				await assert.rejects(
					reader.load(runtime, "invalid", services, attributes),
					/configuration/i,
				);
			}
			assert.equal(constructed, false);
		});

		for (const stage of ["constructed", "initialize", "load"] as const) {
			it(`rejects requests during ${stage} and permits them after initialization succeeds`, async () => {
				const { runtime, services, submitted } = harness(AttachState.Detached);
				const rejected: Promise<void>[] = [];
				const check = (shared: ConfiguredObject): void => {
					for (const method of ["requestChange", "requestChangeLazy"] as const) {
						rejected.push(
							assert.rejects(
								shared.config[method]({ retain: true }),
								validateAssertionError(
									stage === "load"
										? "Cannot submit while loading configured shared object state"
										: "Cannot change configuration during shared object initialization",
								),
							),
						);
					}
				};
				const reader = factory(undefined, {
					[stage]:
						stage === "load"
							? async (shared: ConfiguredObject) => {
									check(shared);
									await Promise.resolve();
									check(shared);
									assert.throws(
										() => shared.edit("during load"),
										validateAssertionError(
											"Cannot submit while loading configured shared object state",
										),
									);
								}
							: check,
				});
				const initialized =
					stage === "load"
						? await reader.load(runtime, "loading", services, reader.attributes)
						: reader.create(runtime, "creating");
				await timeoutAwait(Promise.all(rejected), {
					errorMsg: `Configuration requests made during ${stage} were not rejected`,
				});
				assert.equal(rejected.length, stage === "load" ? 4 : 2);
				assert.equal(initialized.config.current.revision, 0);
				const result = await initialized.config.requestChange({ retain: true });
				assert.equal(result.status, "applied");
				assert.deepEqual(submitted, []);
			});
		}

		for (const stage of ["initialize", "load"] as const) {
			it(`does not allow changes after ${stage} fails`, async () => {
				const { runtime, services } = harness(AttachState.Detached);
				const failure = new Error("initialization failed");
				let shared: ConfiguredObject | undefined;
				const reader = factory(undefined, {
					constructed: (instance) => {
						shared = instance;
					},
					[stage]: () => {
						throw failure;
					},
				});
				if (stage === "load") {
					await assert.rejects(
						reader.load(runtime, "failed", services, reader.attributes),
						(error: unknown) => error === failure,
					);
				} else {
					assert.throws(
						() => reader.create(runtime, "failed"),
						(error: unknown) => error === failure,
					);
				}
				assert(shared !== undefined);
				for (const method of ["requestChange", "requestChangeLazy"] as const) {
					await timeoutAwait(
						assert.rejects(
							shared.config[method]({}),
							validateAssertionError(
								stage === "load"
									? "Cannot submit while loading configured shared object state"
									: "Cannot change configuration during shared object initialization",
							),
						),
						{ errorMsg: `${method} was not rejected after ${stage} failed` },
					);
				}
			});
		}

		it("rejects duplicate registration during construction", () => {
			const { runtime } = harness(AttachState.Detached);
			assert.throws(
				() =>
					factory(undefined, {
						constructed: (shared) => {
							initializeSharedObjectConfiguration(shared, {
								definition,
								initialization: { kind: "create" },
							});
						},
					}).create(runtime, "duplicate"),
				validateAssertionError("Shared object configuration is already initialized"),
			);
		});

		for (const lifecycle of ["initializeLocal", "load", "connect", "bindToContext"] as const) {
			it(`rejects first registration after ${lifecycle} starts`, async () => {
				const { runtime, services } = harness(AttachState.Detached);
				let loading: Promise<void> | undefined;
				const reader = factory(undefined, {
					beforeConfiguration: (shared) => {
						switch (lifecycle) {
							case "initializeLocal": {
								shared.initializeLocal();
								break;
							}
							case "load": {
								loading = shared.load(services);
								break;
							}
							case "connect": {
								shared.connect(services);
								break;
							}
							case "bindToContext": {
								shared.bindToContext();
								break;
							}
							default: {
								assert.fail("Unexpected lifecycle");
							}
						}
					},
				});
				assert.throws(
					() => reader.create(runtime, "late"),
					validateAssertionError(
						"Configuration must be initialized before the shared object lifecycle starts",
					),
				);
				await loading;
			});
		}

		it("enables configuration requests before queued ordinary ops replay during load", async () => {
			const { runtime, services, delta, submitted } = harness();
			let request: ReturnType<ChannelConfigurationFacet<Config>["requestChange"]> | undefined;
			const reader = factory(undefined, {
				load: async (instance) => {
					instance.once("op", () => {
						request = instance.config.requestChange({ retain: true });
					});
				},
			});
			const attach = delta.attach.bind(delta);
			delta.attach = (handler) => {
				attach(handler);
				delta.processMessages(collection(["queued"]));
			};
			const shared = await reader.load(runtime, "replay", services, reader.attributes);
			assert(request !== undefined);
			const proposal = submitted[0];
			assert(proposal !== undefined);
			delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
			const result = await request;
			assert.equal(result.status, "applied");
			assert.equal(shared.config.current.revision, 1);
		});

		it("rejects pending and future requests on runtime disposal", async () => {
			const { runtime, services } = harness();
			const shared = factory().create(runtime, "disposed");
			shared.connect(services);
			const pending = [true, false].map(async (retain) =>
				assert.rejects(shared.config.requestChange({ retain }), /disposed/),
			);
			runtime.dispose();
			await Promise.all(pending);
			await assert.rejects(shared.config.requestChange({}), /disposed/);
		});

		it("rejects pending requests with the channel's ordinary event-listener error", async () => {
			const { runtime, services, delta } = harness();
			const shared = factory().create(runtime, "closed");
			shared.connect(services);
			const pending = Promise.allSettled([
				shared.config.requestChange({ retain: true }),
				shared.config.requestChange({}),
			]);
			shared.on("op", () => {
				throw new Error("ordinary event failed");
			});
			let closedError: unknown;
			assert.throws(
				() => delta.processMessages(collection(["ordinary"])),
				(error: unknown) => {
					assert(error instanceof DataProcessingError);
					closedError = error;
					return true;
				},
			);
			for (const result of await pending) {
				assert.equal(result.status, "rejected");
				assert(result.status === "rejected");
				assert.equal(result.reason, closedError);
			}
			await assert.rejects(
				shared.config.requestChange({}),
				(error: unknown) => error === closedError,
			);
		});

		describe("lazy configuration changes", () => {
			it("does not persist, dirty, or flush idle requests during summaries, incoming ops, or other channel edits", async () => {
				const test = harness();
				const reader = factory();
				const shared = reader.create(test.runtime, "idle");
				shared.connect(test.services);
				const pending = assert.rejects(
					shared.config.requestChangeLazy({ retain: true }),
					/disposed/,
				);
				const baseline = shared.config.current;
				shared.getAttachSummary();
				await shared.summarize();
				test.delta.processMessages(collection(["incoming"]));
				const other = reader.create(test.runtime, "other");
				const otherConnection = harness();
				other.connect(otherConnection.services);
				other.edit("unrelated");
				assert.equal(otherConnection.submitted.length, 1);
				assert.equal(test.submitted.length, 0);
				assert.equal(test.dirty, 0);
				assert.equal(shared.config.current, baseline);
				assert(!("configuration" in roundTripAttributes(shared)));
				assert(!("configuration" in reader.attributes));
				test.runtime.dispose();
				await timeoutAwait(pending, {
					errorMsg: "Idle lazy request was not rejected on runtime disposal",
				});
			});

			it("submits a queued control before the triggering ordinary op and replays that op with the accepted configuration", async () => {
				const { runtime, services, submitted, delta } = harness();
				const shared = factory().create(runtime, "ordered");
				shared.connect(services);
				const request = shared.config.requestChangeLazy({ retain: true });
				let completed = false;
				const completion = request.then(() => {
					completed = true;
				});
				const ordinary = { edit: "fresh" };
				const metadata = { source: "edit" };
				assert.equal(submitted.length, 0);
				shared.edit(ordinary, metadata);
				assert.equal(submitted.length, 2);
				assert.deepEqual(submitted[0]?.contents, barrier(0, true));
				assert.deepEqual(submitted[1], { contents: ordinary, metadata });
				assert.equal(shared.config.current.revision, 0);
				assert(!("configuration" in shared.attributes));
				await Promise.resolve();
				assert.equal(completed, false);
				shared.observed.length = 0;
				delta.processMessages(
					collection(
						submitted.map((message) => message.contents),
						true,
						submitted.map((message) => message.metadata),
					),
				);
				const result = await timeoutAwait(request, {
					errorMsg:
						"Lazy request did not resolve after the control and triggering op were sequenced",
				});
				await completion;
				assert.equal(result.status, "applied");
				assert.equal(result.source, "sequenced");
				assert.deepEqual(shared.config.current, { revision: 1, values: { retain: true } });
				assert.equal(shared.observed.length, 4);
				assert.deepEqual(shared.observed.slice(-3), [
					["pre-op", ordinary, shared.config.current, true],
					["process", ordinary, shared.config.current, true, metadata],
					["op", ordinary, shared.config.current, true],
				]);
			});

			it("applies lazy requests immediately when detached or unpublished in an attached datastore", async () => {
				for (const attachState of [AttachState.Detached, AttachState.Attached]) {
					const { runtime, services, submitted } = harness(attachState);
					const shared = factory().create(runtime, "local");
					if (attachState === AttachState.Detached) {
						shared.connect(services);
					}
					assert.equal(shared.isAttached(), false);
					const request = shared.config.requestChangeLazy({ retain: true });
					assert.deepEqual(shared.config.current, { revision: 1, values: { retain: true } });
					assert("configuration" in roundTripAttributes(shared));
					const result = await timeoutAwait(request, {
						errorMsg: `Unpublished lazy request did not resolve locally (attachState=${attachState})`,
					});
					assert.equal(result.status, "applied");
					assert.equal(result.source, "local");
					assert.deepEqual(submitted, []);
				}
			});

			it("keeps disconnected bound requests deferred through reconnect until a fresh edit", async () => {
				const { runtime, services, submitted, delta } = harness();
				const shared = factory().create(runtime, "disconnected");
				shared.connect(services);
				delta.setConnectionState(false);
				assert.equal(shared.connected, false);
				assert.equal(shared.isAttached(), true);
				const request = shared.config.requestChangeLazy({ retain: true });
				assert.equal(submitted.length, 0);
				assert.equal(shared.config.current.revision, 0);
				delta.setConnectionState(true);
				assert.equal(submitted.length, 0);
				shared.edit("fresh");
				assert.deepEqual(
					submitted.map((message) => message.contents),
					[barrier(0, true), "fresh"],
				);
				delta.processMessages(
					collection(
						submitted.map((message) => message.contents),
						true,
						submitted.map((message) => message.metadata),
					),
				);
				const result = await timeoutAwait(request, {
					errorMsg:
						"Disconnected lazy request did not resolve after reconnect and a fresh edit",
				});
				assert.equal(result.status, "applied");
			});

			it("flushes a lazy request before an eager request and applies the lazy change", async () => {
				const { runtime, services, submitted, delta } = harness();
				const shared = factory().create(runtime, "ordered-configuration");
				shared.connect(services);
				const lazy = shared.config.requestChangeLazy({ retain: true });
				const eager = shared.config.requestChange({ retain: false });
				assert.deepEqual(
					submitted.map((message) => message.contents),
					[barrier(0, true), barrier(0, false)],
				);
				assert.equal(shared.config.current.revision, 0);
				delta.processMessages(
					collection(
						submitted.map((message) => message.contents),
						true,
						submitted.map((message) => message.metadata),
					),
				);
				const results = await timeoutAwait(Promise.all([lazy, eager]), {
					errorMsg:
						"Lazy and eager requests did not resolve after sequencing in request order",
				});
				assert.deepEqual(
					results.map((result) => result.status),
					["applied", "conflict"],
				);
				assert.deepEqual(shared.config.current, { revision: 1, values: { retain: true } });
			});

			it("does not flush or rebase the captured revision when remote changes advance it", async () => {
				const { runtime, services, submitted, delta } = harness();
				const shared = factory().create(runtime, "conflict");
				shared.connect(services);
				const lazy = shared.config.requestChangeLazy({ retain: true });
				delta.processMessages(collection([barrier(0, false), barrier(1, true)]));
				assert.equal(shared.config.current.revision, 2);
				assert.equal(submitted.length, 0);
				shared.edit("trigger");
				const lazyProposal = submitted[0];
				assert(lazyProposal !== undefined);
				assert.deepEqual(lazyProposal.contents, barrier(0, true));
				assert.equal(submitted[1]?.contents, "trigger");
				delta.processMessages(
					collection([lazyProposal.contents], true, [lazyProposal.metadata]),
				);
				const result = await timeoutAwait(lazy, {
					errorMsg: "Lazy request did not resolve after conflicting with remote changes",
				});
				assert.equal(result.status, "conflict");
				assert.deepEqual(result.current, { revision: 2, values: { retain: true } });
			});

			it("rejects unsent lazy requests and future requests when the runtime is disposed", async () => {
				const { runtime, services, submitted } = harness();
				const shared = factory().create(runtime, "disposed-lazy");
				shared.connect(services);
				const pending = assert.rejects(
					shared.config.requestChangeLazy({ retain: true }),
					/disposed/,
				);
				runtime.dispose();
				await timeoutAwait(pending, {
					errorMsg: "Unsent lazy request was not rejected on runtime disposal",
				});
				await timeoutAwait(assert.rejects(shared.config.requestChangeLazy({}), /disposed/), {
					errorMsg: "New lazy request was not rejected after runtime disposal",
				});
				assert.deepEqual(submitted, []);
				assert.equal(shared.config.current.revision, 0);
				assert(!("configuration" in shared.attributes));
			});

			it("checks values and read-only state at invocation rather than first edit", async () => {
				const { runtime, services, submitted } = harness();
				const shared = factory().create(runtime, "invalid-lazy");
				shared.connect(services);
				const unsupported = { retain: true, unsupported: true };
				await timeoutAwait(
					assert.rejects(
						shared.config.requestChangeLazy(unsupported),
						/Unsupported channel configuration values/,
					),
					{ errorMsg: "Lazy request with unsupported values was not rejected at invocation" },
				);
				runtime.notifyReadOnlyState(true);
				await timeoutAwait(
					assert.rejects(shared.config.requestChangeLazy({ retain: true }), /read-only/),
					{ errorMsg: "Lazy request on a read-only runtime was not rejected at invocation" },
				);
				runtime.notifyReadOnlyState(false);
				shared.edit("fresh");
				assert.deepEqual(submitted, [{ contents: "fresh", metadata: undefined }]);
				assert.equal(shared.config.current.revision, 0);
				assert(!("configuration" in shared.attributes));
			});

			it("suppresses lazy flushing during resubmit, squash, stash, and rollback, then resubmits materialized controls normally", async () => {
				const { runtime, services, submitted, delta } = harness();
				const shared = factory().create(runtime, "replay-lazy");
				shared.connect(services);
				const metadata = { source: "original" };
				shared.edit("original", metadata);
				const request = shared.config.requestChangeLazy({ retain: true });
				delta.reSubmit("original", metadata, false);
				delta.reSubmit("original", metadata, true);
				delta.applyStashedOp("stashed");
				assert(delta.rollback !== undefined);
				delta.rollback("original", metadata);
				assert.deepEqual(
					submitted.map((message) => message.contents),
					["original", "original", "original", "stashed", { rollback: "original" }],
				);
				assert.equal(shared.config.current.revision, 0);
				assert(!("configuration" in shared.attributes));
				shared.edit("fresh");
				const proposal = submitted[5];
				assert(proposal !== undefined);
				assert.deepEqual(proposal.contents, barrier(0, true));
				assert.equal(submitted[6]?.contents, "fresh");
				delta.reSubmit(proposal.contents, proposal.metadata, false);
				assert.deepEqual(submitted[7], proposal);
				delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
				const result = await timeoutAwait(request, {
					errorMsg:
						"Lazy request did not resolve after replay suppression and control resubmission",
				});
				assert.equal(result.status, "applied");
			});
		});

		it("loads and summarizes lazy configuration replay through the real datastore runtime", async () => {
			const reader = factory();
			const attributes = JSON.stringify(reader.attributes);
			const context = new MockFluidDataStoreContext("store", true);
			context.isLocalDataStore = false;
			context.attachState = AttachState.Attached;
			context.baseSnapshot = {
				blobs: {},
				trees: { dds: { blobs: { ".attributes": "attributes" }, trees: {} } },
			};
			const storage: Pick<IRuntimeStorageService, "readBlob"> = {
				readBlob: async (id) => {
					assert.equal(id, "attributes");
					return stringToBuffer(attributes, "utf8");
				},
			};
			context.storage = storage as IRuntimeStorageService;
			context.getCreateChildSummarizerNodeFn = () => (summarize) => {
				const node: Pick<ISummarizerNodeWithGC, "invalidate" | "summarize"> = {
					invalidate: () => {},
					summarize: async (fullTree, trackState, telemetryContext) =>
						summarize(fullTree, trackState ?? true, telemetryContext),
				};
				return node as ISummarizerNodeWithGC;
			};
			let lookups = 0;
			const runtime = new FluidDataStoreRuntime(
				context,
				{
					get: () => {
						lookups++;
						return reader;
					},
				},
				true,
				async () => ({}),
			);
			runtime.processMessages(
				collection(
					["before", barrier(0, true), "after"].map((contents) => ({
						address: "dds",
						contents,
					})),
				),
			);
			assert.equal(lookups, 0);
			const summary = await runtime.summarize(true, false);
			const channel = summary.summary.tree.dds;
			assert(channel?.type === SummaryType.Tree);
			const attributeBlob = channel.tree[".attributes"];
			assert(attributeBlob?.type === SummaryType.Blob);
			assert.equal(
				attributeBlob.content,
				JSON.stringify({
					...reader.attributes,
					configuration: { version: 1, revision: 1, values: { retain: true } },
				}),
			);
			const shared = (await runtime.getChannel("dds")) as ConfiguredObject;
			assert.equal(lookups, 1);
			assert.deepEqual(shared.config.current, { revision: 1, values: { retain: true } });
			assert(!("configuration" in reader.attributes));
			runtime.dispose();
		});
	});
}
