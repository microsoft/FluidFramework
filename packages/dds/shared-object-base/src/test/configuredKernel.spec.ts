/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";

import { generation, stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IChannel,
	IChannelAttributes,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import {
	type IRuntimeMessageCollection,
	type IRuntimeStorageService,
	type ISummarizerNodeWithGC,
	supportsSharedObjectConfiguration,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { DataProcessingError, UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockFluidDataStoreContext,
	MockHandle,
	MockStorage,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import type {
	ChannelConfigurationDefinition,
	ChannelConfigurationFacet,
	ChannelConfigurationChange,
} from "../channelConfiguration.js";
import type { ISharedObjectKind, SharedObjectKindAlpha } from "../sharedObject.js";
import {
	defaultSharedObjectProtocol,
	getSharedObjectProtocol,
	sharedObjectProtocols,
} from "../sharedObjectProtocol.js";
import {
	makeSharedObjectKind,
	type FactoryOut,
	type KernelArgs,
	type SharedKernel,
	type SharedKernelMessageCollection,
} from "../sharedObjectKernel.js";
import type { ISharedObject } from "../types.js";
import { createSingleBlobSummary } from "../utils.js";

type Config = Readonly<{ retain?: boolean }>;

const definition: ChannelConfigurationDefinition<Config> = {
	defaultConfiguration: {},
	isSupported: (values): values is Config =>
		Object.keys(values).every((key) => key === "retain") &&
		(values.retain === undefined || typeof values.retain === "boolean"),
	validateTransition: () => {},
};

interface View {
	readonly config: ChannelConfigurationFacet<Config> | undefined;
	readonly observed: unknown[];
	edit(contents: unknown, metadata?: unknown): void;
}

function makeKind(
	initialConfiguration?: Config,
	support: boolean = true,
	type: string = "configured-test",
	options: {
		processMessages?: () => void;
		configurationDefinition?: ChannelConfigurationDefinition<Config>;
	} = {},
): ISharedObjectKind<View> & SharedObjectKindAlpha<View> {
	function create(args: KernelArgs<Config>): FactoryOut<View> {
		const observed: unknown[] = [["initial", args.configuration?.current]];
		args.configuration?.on("changed", (change) => {
			observed.push(["configuration", change]);
		});
		const edit = (contents: unknown, metadata?: unknown): void => {
			observed.push(["optimistic", contents]);
			args.submitLocalMessage(contents, metadata);
		};
		const kernel: SharedKernel = {
			summarizeCore: () => createSingleBlobSummary("data", JSON.stringify(observed)),
			onDisconnect: () => {},
			processMessagesCore: (messages: SharedKernelMessageCollection) => {
				options.processMessages?.();
				for (const message of messages.messagesContent) {
					observed.push([
						"operation",
						message.contents,
						message.localOpMetadata,
						args.configuration?.current.revision,
						messages.local,
					]);
				}
			},
			reSubmitCore: (contents, metadata) => {
				args.submitLocalMessage({ part: 1, contents }, metadata);
				args.submitLocalMessage({ part: 2, contents }, metadata);
			},
			applyStashedOp: (contents) => {
				edit({ stashed: 1, contents }, "restored-one");
				edit({ stashed: 2, contents }, "restored-two");
			},
			rollback: (contents, metadata) => observed.push(["rollback", contents, metadata]),
		};
		return { kernel, view: { config: args.configuration, observed, edit } };
	}
	return makeSharedObjectKind<View, Config>({
		type,
		attributes: { type, snapshotFormatVersion: "1" },
		telemetryContextPrefix: "configured-test",
		factory: {
			...(support
				? { configurationDefinition: options.configurationDefinition ?? definition }
				: {}),
			create,
			loadCore: async (args) => create(args),
		},
		...(initialConfiguration === undefined ? {} : { initialConfiguration }),
	});
}

interface Harness {
	readonly runtime: MockFluidDataStoreRuntime & {
		isSharedObjectConfigurationEnabled: () => boolean;
	};
	readonly delta: MockDeltaConnection;
	readonly services: IChannelServices;
	readonly submitted: { contents: unknown; metadata: unknown }[];
	readonly dirty: number;
}

function harness(
	attachState: AttachState = AttachState.Attached,
	onSubmit?: () => void,
): Harness {
	const runtime = Object.assign(new MockFluidDataStoreRuntime({ attachState }), {
		isSharedObjectConfigurationEnabled: () => true,
	});
	const submitted: { contents: unknown; metadata: unknown }[] = [];
	let dirty = 0;
	const delta = new MockDeltaConnection(
		(contents: unknown, metadata) => {
			const clientSequenceNumber = submitted.push({ contents, metadata });
			onSubmit?.();
			return clientSequenceNumber;
		},
		() => dirty++,
	);
	const services: IChannelServices = {
		deltaConnection: delta,
		objectStorage: new MockStorage(),
	};
	return {
		runtime,
		delta,
		services,
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

function barrier(expectedRevision: number, retain: boolean): unknown {
	return { version: 1, isChannelConfigurationOp: true, expectedRevision, values: { retain } };
}

function requireConfig(view: View): ChannelConfigurationFacet<Config> {
	assert(view.config !== undefined);
	return view.config;
}

function datastoreHarness(
	factory: ReturnType<ReturnType<typeof makeKind>["getFactory"]>,
	onLoad: (shared: IChannel & View) => void = () => {},
): {
	runtime: FluidDataStoreRuntime;
	errors: unknown[];
	readonly shared: IChannel & View;
	process: (contents: unknown) => void;
} {
	const baseline = factory.create(harness(AttachState.Detached).runtime, "baseline");
	const attributes = JSON.stringify(baseline.attributes);
	const context = new MockFluidDataStoreContext("store", true);
	context.isLocalDataStore = false;
	context.attachState = AttachState.Attached;
	Object.assign(context, {
		isSharedObjectConfigurationEnabled: () => true,
	});
	context.ILayerCompatDetails = {
		generation,
		pkgVersion: "test",
		supportedFeatures: new Set([supportsSharedObjectConfiguration]),
	};
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
	context.getCreateChildSummarizerNodeFn = () => () => {
		const node: Pick<ISummarizerNodeWithGC, "invalidate"> = { invalidate: () => {} };
		return node as ISummarizerNodeWithGC;
	};
	const errors: unknown[] = [];
	let shared: (IChannel & View) | undefined;
	const load = factory.load.bind(factory);
	factory.load = async (dataStoreRuntime, id, services, channelAttributes) => {
		const attach = services.deltaConnection.attach.bind(services.deltaConnection);
		services.deltaConnection.attach = (handler) => {
			attach({
				...handler,
				processMessages: (messages) => {
					try {
						handler.processMessages(messages);
					} catch (error) {
						// Observe the core's error before the real delta connection normalizes it.
						errors.push(error);
						throw error;
					}
				},
			});
		};
		shared = await load(dataStoreRuntime, id, services, channelAttributes);
		onLoad(shared);
		return shared;
	};
	const runtime = new FluidDataStoreRuntime(
		context,
		{ get: () => factory },
		true,
		async () => ({}),
	);
	return {
		runtime,
		errors,
		get shared() {
			assert(shared !== undefined);
			return shared;
		},
		process: (contents) => runtime.processMessages(collection([{ address: "dds", contents }])),
	};
}

describe("configured kernel composition", () => {
	describe("lazy configuration", () => {
		it("asserts on dirty-listener reentry while submitting lazy controls before the ordinary op", async () => {
			const events = new EventEmitter();
			const test = harness(AttachState.Attached, () => events.emit("dirty"));
			const shared = makeKind().getFactory().create(test.runtime, "lazy");
			shared.connect(test.services);
			const config = requireConfig(shared);
			const first = config.requestChangeLazy({ retain: true });
			const second = config.requestChangeLazy({ retain: false });
			assert.equal(test.submitted.length, 0);
			assert.equal(test.dirty, 0);
			events.once("dirty", () => {
				assert.throws(
					() => shared.edit("nested", "nested metadata"),
					/reentrantly while flushing lazy configuration/,
				);
			});
			shared.edit("outer", "outer metadata");
			assert.deepEqual(
				test.submitted.map(({ contents }) => contents),
				[barrier(0, true), barrier(0, false), "outer"],
			);
			assert.equal(test.submitted[2]?.metadata, "outer metadata");
			assert.equal(config.current.revision, 0);
			test.delta.processMessages(
				collection(
					test.submitted.map(({ contents }) => contents),
					true,
					test.submitted.map(({ metadata }) => metadata),
				),
			);
			const firstResult = await first;
			const secondResult = await second;
			assert.equal(firstResult.status, "applied");
			assert.equal(secondResult.status, "conflict");
			assert.deepEqual(
				shared.observed.filter((item) => Array.isArray(item) && item[0] === "operation"),
				[["operation", "outer", "outer metadata", 1, true]],
			);
		});

		it("allows normal dirty-listener edits once the lazy flush has completed", async () => {
			const events = new EventEmitter();
			const test = harness(AttachState.Attached, () => events.emit("dirty"));
			const shared = makeKind().getFactory().create(test.runtime, "lazy");
			shared.connect(test.services);
			const request = requireConfig(shared).requestChangeLazy({ retain: true });
			events.once("dirty", () => {
				events.once("dirty", () => shared.edit("nested"));
			});
			shared.edit("outer");
			assert.deepEqual(
				test.submitted.map(({ contents }) => contents),
				[barrier(0, true), "outer", "nested"],
			);
			test.delta.processMessages(
				collection(
					test.submitted.map(({ contents }) => contents),
					true,
					test.submitted.map(({ metadata }) => metadata),
				),
			);
			const result = await request;
			assert.equal(result.status, "applied");
		});

		for (const onlyBind of [false, true]) {
			it(`does not flush until ordinary validation and handle preparation succeed (onlyBind=${onlyBind})`, async () => {
				const { runtime, delta, services, submitted } = harness();
				Object.assign(runtime, { submitMessagesWithoutEncodingHandles: onlyBind });
				const shared = makeKind().getFactory().create(runtime, "lazy");
				shared.connect(services);
				const request = requireConfig(shared).requestChangeLazy({ retain: true });
				assert.throws(() => shared.edit(barrier(0, false)), DataProcessingError);
				const failure = new Error("Payload preparation failed");
				assert.throws(
					() =>
						shared.edit({
							get invalid(): unknown {
								throw failure;
							},
						}),
					(error) => error === failure,
				);
				assert.equal(submitted.length, 0);
				assert(!("configuration" in shared.attributes));
				const handle = new MockHandle("value");
				const metadata = { ordinary: true };
				shared.edit({ handle }, metadata);
				assert.equal(submitted.length, 2);
				assert.deepEqual(submitted[0]?.contents, barrier(0, true));
				assert.equal(submitted[1]?.metadata, metadata);
				delta.processMessages(
					collection(
						submitted.map(({ contents }) => contents),
						true,
						submitted.map(({ metadata: localMetadata }) => localMetadata),
					),
				);
				const result = await request;
				assert.equal(result.status, "applied");
				const observed = shared.observed.at(-1);
				assert(Array.isArray(observed));
				assert.equal(observed[0], "operation");
				assert.equal(observed[2], metadata);
				assert.equal(observed[3], 1);
				const processed: unknown = observed[1];
				assert(typeof processed === "object" && processed !== null && "handle" in processed);
				assert(isFluidHandle(processed.handle));
			});
		}

		it("propagates a control submission failure without sending the triggering ordinary op", async () => {
			const { runtime, delta, services, submitted } = harness();
			const shared = makeKind().getFactory().create(runtime, "lazy");
			shared.connect(services);
			const failure = new Error("Submission failed");
			const submit = delta.submit.bind(delta);
			delta.submit = (contents, metadata) => {
				if (typeof contents === "string") {
					return submit(contents, metadata);
				}
				throw failure;
			};
			const rejected = assert.rejects(
				requireConfig(shared).requestChangeLazy({ retain: true }),
				(error) => error === failure,
			);
			assert.throws(
				() => shared.edit("not submitted"),
				(error) => error === failure,
			);
			await rejected;
			assert.equal(submitted.length, 0);
			delta.submit = submit;
			shared.edit("next");
			assert.deepEqual(submitted, [{ contents: "next", metadata: undefined }]);
			assert(!("configuration" in shared.attributes));
		});

		it("does not submit the ordinary op after disposal during the lazy flush", async () => {
			const events = new EventEmitter();
			const test = harness(AttachState.Attached, () => events.emit("submit"));
			const shared = makeKind().getFactory().create(test.runtime, "lazy");
			shared.connect(test.services);
			const rejected = assert.rejects(
				requireConfig(shared).requestChangeLazy({ retain: true }),
				/disposed/,
			);
			events.once("submit", () => test.runtime.dispose());
			assert.throws(() => shared.edit("ordinary"), /disposed/);
			await rejected;
			assert.deepEqual(
				test.submitted.map(({ contents }) => contents),
				[barrier(0, true)],
			);
		});

		it("does not resubmit flushed configuration when the ordinary submission fails", async () => {
			const { runtime, delta, services, submitted } = harness();
			const shared = makeKind().getFactory().create(runtime, "lazy");
			shared.connect(services);
			const request = requireConfig(shared).requestChangeLazy({ retain: true });
			const submit = delta.submit.bind(delta);
			const failure = new Error("Ordinary submission failed");
			delta.submit = (contents, metadata) => {
				if (typeof contents === "string") {
					throw failure;
				}
				return submit(contents, metadata);
			};
			assert.throws(
				() => shared.edit("failed"),
				(error) => error === failure,
			);
			assert.equal(submitted.length, 1);
			delta.submit = submit;
			shared.edit("successful");
			assert.deepEqual(
				submitted.map(({ contents }) => contents),
				[barrier(0, true), "successful"],
			);
			delta.processMessages(
				collection(
					submitted.map(({ contents }) => contents),
					true,
					submitted.map(({ metadata }) => metadata),
				),
			);
			const result = await request;
			assert.equal(result.status, "applied");
		});

		it("keeps new lazy intent out of real datastore stashed-op submission capture", async () => {
			const test = datastoreHarness(makeKind().getFactory());
			await test.runtime.getChannel("dds");
			const pending = assert.rejects(
				requireConfig(test.shared).requestChangeLazy({ retain: true }),
				/disposed/,
			);
			assert.equal(test.runtime.isDirty, false);
			const content = { address: "dds", contents: "restored" };
			const metadata = await test.runtime.applyStashedOp({ type: "op", content });
			test.runtime.processMessages(collection([content], true, [metadata]));
			assert.deepEqual(test.shared.observed.slice(-2), [
				["operation", { stashed: 1, contents: "restored" }, "restored-one", 0, true],
				["operation", { stashed: 2, contents: "restored" }, "restored-two", 0, true],
			]);
			assert.equal(test.runtime.isDirty, false);
			assert(!("configuration" in test.shared.attributes));
			assert.equal(test.errors.length, 0);
			test.runtime.dispose();
			await pending;
		});
	});

	it("activates an unmarked snapshot during lazy replay before exposure and summary", async () => {
		const factory = makeKind().getFactory();
		const baseline = factory.create(harness(AttachState.Detached).runtime, "baseline");
		assert(!("configuration" in baseline.attributes));
		const attributes = JSON.stringify(baseline.attributes);
		const context = new MockFluidDataStoreContext("store", true);
		context.isLocalDataStore = false;
		context.attachState = AttachState.Attached;
		Object.assign(context, {
			isSharedObjectConfigurationEnabled: () => true,
		});
		context.ILayerCompatDetails = {
			generation,
			pkgVersion: "test",
			supportedFeatures: new Set([supportsSharedObjectConfiguration]),
		};
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
		const invalidated: number[] = [];
		context.getCreateChildSummarizerNodeFn = () => (summarize) => {
			const node: Pick<ISummarizerNodeWithGC, "invalidate" | "summarize"> = {
				invalidate: (sequenceNumber) => invalidated.push(sequenceNumber),
				summarize: async (fullTree, trackState, telemetryContext) =>
					summarize(fullTree, trackState ?? true, telemetryContext),
			};
			return node as ISummarizerNodeWithGC;
		};
		let factoryLookups = 0;
		const runtime = new FluidDataStoreRuntime(
			context,
			{
				get: () => {
					factoryLookups++;
					return factory;
				},
			},
			true,
			async () => ({}),
		);
		const message = collection([
			"snapshot configuration",
			barrier(0, true),
			"authored before configuration changed",
			barrier(1, false),
		]);
		runtime.processMessages({
			...message,
			messagesContent: message.messagesContent.map((item) => ({
				...item,
				contents: { address: "dds", contents: item.contents },
			})),
		});
		assert.equal(factoryLookups, 0);
		assert.deepEqual(invalidated, [10]);
		const replayedSummary = await runtime.summarize(true, false);
		const replayedChannel = replayedSummary.summary.tree.dds;
		assert(replayedChannel?.type === SummaryType.Tree);
		const replayedAttributes = replayedChannel.tree[".attributes"];
		assert(replayedAttributes?.type === SummaryType.Blob);
		assert.equal(
			replayedAttributes.content,
			JSON.stringify({
				...factory.attributes,
				configuration: { version: 1, revision: 2, values: { retain: false } },
			}),
		);
		const loaded = (await runtime.getChannel("dds")) as IChannel & View;
		assert.equal(factoryLookups, 1);
		assert("configuration" in loaded.attributes);
		assert.equal(requireConfig(loaded).current.revision, 2);
		assert.deepEqual(
			loaded.observed.map((item): unknown => (Array.isArray(item) ? item[0] : item)),
			["initial", "operation", "configuration", "operation", "configuration"],
		);
		const restoredOperation = { address: "dds", contents: "stashed earlier" };
		const restoredMetadata = await runtime.applyStashedOp({
			type: "op",
			content: restoredOperation,
		});
		assert(runtime.isDirty);
		runtime.processMessages(collection([restoredOperation], true, [restoredMetadata]));
		assert.equal(runtime.isDirty, false);
		assert.deepEqual(loaded.observed.slice(-2), [
			["operation", { stashed: 1, contents: "stashed earlier" }, "restored-one", 2, true],
			["operation", { stashed: 2, contents: "stashed earlier" }, "restored-two", 2, true],
		]);
		const restoredProposal = { address: "dds", contents: barrier(2, true) };
		const proposalMetadata = await runtime.applyStashedOp({
			type: "op",
			content: restoredProposal,
		});
		assert.equal(requireConfig(loaded).current.revision, 2);
		runtime.processMessages(collection([restoredProposal], true, [proposalMetadata]));
		assert.equal(requireConfig(loaded).current.revision, 3);
		assert.equal(runtime.isDirty, false);
		const summary = await runtime.summarize(true, false);
		assert.equal(summary.summary.type, SummaryType.Tree);
		assert(summary.summary.type === SummaryType.Tree);
		const channelSummary = summary.summary.tree.dds;
		assert(channelSummary?.type === SummaryType.Tree);
		const attributesBlob = channelSummary.tree[".attributes"];
		assert(attributesBlob?.type === SummaryType.Blob);
		assert.equal(attributesBlob.content, JSON.stringify(loaded.attributes));
	});

	for (const lazy of [false, true]) {
		for (const malformed of [false, true]) {
			it(`leaves ${malformed ? "malformed configuration ops" : "DDS processor errors"} to the real delta connection during ${lazy ? "lazy replay" : "live processing"}`, async () => {
				const processorError = new Error("DDS processor failed");
				const factory = makeKind({}, true, "configured-test", {
					processMessages: () => {
						throw processorError;
					},
				}).getFactory();
				const rejections: unknown[] = [];
				let pending: Promise<void>[] = [];
				const test = datastoreHarness(factory, (shared) => {
					const config = requireConfig(shared);
					pending = [
						config.requestChange({ retain: true }),
						config.requestChange({ retain: false }),
					].map(async (request) =>
						assert.rejects(request, (error: unknown) => {
							rejections.push(error);
							return true;
						}),
					);
				});
				const checkError = (error: unknown): boolean => {
					assert.equal(test.errors.length, 1);
					const rawError = test.errors[0];
					if (malformed) {
						assert(rawError instanceof Error);
						assert(!(rawError instanceof UsageError));
						validateAssertionError("Unsupported channel configuration protocol version")(
							rawError,
						);
					} else {
						assert.equal(rawError, processorError);
					}
					assert(error instanceof DataProcessingError);
					assert.notEqual(error, rawError);
					assert.equal(
						error.getTelemetryProperties().dataProcessingCodepath,
						"channelDeltaConnectionFailedToProcessMessages",
					);
					return true;
				};
				const contents = malformed ? { version: 2, isChannelConfigurationOp: true } : "fail";
				if (lazy) {
					test.process(contents);
					assert.equal(test.errors.length, 0);
					await assert.rejects(test.runtime.getChannel("dds"), checkError);
				} else {
					await test.runtime.getChannel("dds");
					assert.throws(() => test.process(contents), checkError);
				}
				assert.equal(test.runtime.disposed, false);
				assert.doesNotThrow(() => test.shared.edit("still open"));
				await new Promise<void>((resolve) => setImmediate(resolve));
				assert.equal(rejections.length, 0);

				test.runtime.dispose();
				await Promise.all(pending);
				assert.equal(rejections.length, 2);
				for (const error of rejections) {
					assert(error instanceof Error);
					assert(!(error instanceof UsageError));
					assert(!(error instanceof DataProcessingError));
					assert.match(error.message, /disposed/);
					assert.notEqual(error, test.errors[0]);
				}
				await assert.rejects(requireConfig(test.shared).requestChange({}), /disposed/);
			});
		}
	}

	for (const callback of [false, true]) {
		it(`rejects all pending requests with the original configuration ${callback ? "callback" : "validation"} error`, async () => {
			const failure = new Error("configuration failed");
			let failValidation = false;
			const factory = makeKind({}, true, "configured-test", {
				configurationDefinition: {
					...definition,
					validateTransition: () => {
						if (failValidation) {
							throw failure;
						}
					},
				},
			}).getFactory();
			const test = datastoreHarness(factory);
			await test.runtime.getChannel("dds");
			const config = requireConfig(test.shared);
			const pending = [
				config.requestChange({ retain: true }),
				config.requestChange({ retain: false }),
			].map(async (request) => assert.rejects(request, (error: unknown) => error === failure));
			if (callback) {
				config.on("changed", () => {
					throw failure;
				});
			} else {
				failValidation = true;
			}
			assert.throws(
				() => test.process(barrier(0, true)),
				(error: unknown) => {
					assert.equal(test.errors[0], failure);
					assert(error instanceof DataProcessingError);
					assert.notEqual(error, failure);
					assert.equal(
						error.getTelemetryProperties().dataProcessingCodepath,
						"channelDeltaConnectionFailedToProcessMessages",
					);
					return true;
				},
			);
			assert.equal(test.runtime.disposed, false);
			await Promise.all(pending);
			await assert.rejects(config.requestChange({}), (error: unknown) => error === failure);
			assert.throws(
				() => test.shared.edit("disposed configuration"),
				(error: unknown) => error === failure,
			);
			test.runtime.dispose();
		});
	}

	it("preserves common event-listener wrapping and channel closure", async () => {
		const test = datastoreHarness(makeKind({}).getFactory());
		await test.runtime.getChannel("dds");
		const config = requireConfig(test.shared);
		const pending = [config.requestChange({ retain: true }), config.requestChange({})];
		const settled = Promise.allSettled(pending);
		const listenerError = new Error("op listener failed");
		(test.shared as View & ISharedObject).on("op", () => {
			throw listenerError;
		});
		let closedError: unknown;
		assert.throws(
			() => test.process("trigger listener"),
			(error: unknown) => {
				assert(error instanceof DataProcessingError);
				assert.notEqual(error, listenerError);
				assert.equal(test.errors[0], error);
				assert.equal(
					error.getTelemetryProperties().dataProcessingCodepath,
					"SharedObjectEventListenerException",
				);
				assert.equal(error.getTelemetryProperties().emittedEventName, "op");
				closedError = error;
				return true;
			},
		);
		assert.equal(test.runtime.disposed, false);
		for (const result of await settled) {
			assert.equal(result.status, "rejected");
			assert(result.status === "rejected");
			assert.equal(result.reason, closedError);
		}
		assert.throws(
			() => test.shared.edit("closed"),
			(error: unknown) => error === closedError,
		);
		assert.throws(
			() => test.process("closed"),
			(error: unknown) => error === closedError,
		);
		await assert.rejects(config.requestChange({}), (error: unknown) => error === closedError);
		test.runtime.dispose();
	});

	it("initializes the facet before create and makes local changes synchronously without ops", async () => {
		const { runtime, submitted } = harness(AttachState.Detached);
		const shared = makeKind({ retain: false }).getFactory().create(runtime, "local");
		const config = requireConfig(shared);
		assert.deepEqual(shared.observed, [["initial", config.current]]);
		const change = config.requestChange({ retain: true });
		assert.equal(config.current.values.retain, true);
		assert.equal(config.current.revision, 1);
		assert.equal(shared.observed.length, 2);
		const result = await change;
		assert.equal(result.source, "local");
		await config.requestChange({});
		await config.requestChange({});
		assert.deepEqual(config.current.values, {});
		assert.equal(config.current.revision, 3);
		assert.deepEqual(submitted, []);
	});

	it("keeps an unbound channel local even inside an attached container", async () => {
		const { runtime, services, delta, submitted } = harness();
		const shared = makeKind({}).getFactory().create(runtime, "unbound");
		const config = requireConfig(shared);
		assert.equal(shared.isAttached(), false);
		const result = await config.requestChange({ retain: true });
		assert.equal(result.source, "local");
		assert.equal(submitted.length, 0);
		shared.connect(services);
		assert.equal(shared.isAttached(), true);
		const request = config.requestChange({ retain: false });
		assert.equal(config.current.values.retain, true);
		const proposal = submitted[0];
		assert(proposal !== undefined);
		delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
		const sequenced = await request;
		assert.equal(sequenced.source, "sequenced");
	});

	it("allows local activation but requires document capability before attachment", async () => {
		const { runtime, services } = harness(AttachState.Detached);
		runtime.isSharedObjectConfigurationEnabled = () => false;
		const shared = makeKind().getFactory().create(runtime, "local");
		await requireConfig(shared).requestChange({ retain: true });
		shared.connect(services);
		assert.throws(
			() => runtime.setAttachState(AttachState.Attaching),
			validateAssertionError("Shared object configuration document capability is not enabled"),
		);
		assert.equal(requireConfig(shared).current.values.retain, true);
	});

	it("allows ordinary use before the document flag and activation once it is enabled", async () => {
		const { runtime, services, delta, submitted } = harness();
		runtime.isSharedObjectConfigurationEnabled = () => false;
		const shared = makeKind().getFactory().create(runtime, "dormant");
		shared.connect(services);
		shared.edit("before activation");
		assert.equal(submitted[0]?.contents, "before activation");
		const config = requireConfig(shared);
		await assert.rejects(config.requestChange({ retain: true }), /capability is not enabled/);
		assert.equal(config.current.revision, 0);
		assert(!("configuration" in shared.attributes));
		assert.equal(submitted.length, 1);

		runtime.isSharedObjectConfigurationEnabled = () => true;
		const request = config.requestChange({ retain: true });
		assert(!("configuration" in shared.attributes));
		const proposal = submitted[1];
		assert(proposal !== undefined);
		delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
		const result = await request;
		assert.equal(result.status, "applied");
		assert("configuration" in shared.attributes);
		assert.equal(config.current.values.retain, true);
	});

	it("keeps connected detached changes local and sequences changes from attaching onward", async () => {
		const { runtime, services, submitted, delta } = harness(AttachState.Detached);
		const shared = makeKind({}).getFactory().create(runtime, "attaching");
		const config = requireConfig(shared);
		await config.requestChange({ retain: true });
		shared.getAttachSummary();
		const baseline = JSON.stringify(shared.attributes);
		shared.connect(services);
		assert.equal(shared.isAttached(), false);
		const local = config.requestChange({ retain: false });
		shared.edit("detached after serialization");
		assert.equal(config.current.values.retain, false);
		assert.notEqual(JSON.stringify(shared.attributes), baseline);
		assert.equal(submitted.length, 0);
		const localResult = await local;
		assert.equal(localResult.source, "local");
		runtime.setAttachState(AttachState.Attaching);
		assert.equal(shared.isAttached(), true);
		const change = config.requestChange({ retain: true });
		shared.edit("attaching");
		assert.equal(config.current.values.retain, false);
		assert.equal(submitted.length, 2);
		const proposal = submitted[0];
		assert(proposal !== undefined);
		assert.deepEqual(proposal.contents, barrier(2, true));
		assert.equal(submitted[1]?.contents, "attaching");
		delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
		const result = await change;
		assert.equal(result.source, "sequenced");
		assert.equal(config.current.values.retain, true);
		runtime.setAttachState(AttachState.Attached);
		const attached = config.requestChange({});
		assert.equal(config.current.revision, 3);
		const attachedProposal = submitted[2];
		assert(attachedProposal !== undefined);
		delta.processMessages(
			collection([attachedProposal.contents], true, [attachedProposal.metadata]),
		);
		const attachedResult = await attached;
		assert.equal(attachedResult.source, "sequenced");
		assert.equal(config.current.revision, 4);
	});

	it("keeps disconnected attached requests pending and preserves CAS completion through replay", async () => {
		const { runtime, delta, services, submitted } = harness();
		const factory = makeKind({}).getFactory();
		const shared = await factory.load(
			runtime,
			"loaded",
			services,
			factory.create(runtime, "base").attributes,
		);
		const config = requireConfig(shared);
		delta.setConnectionState(false);
		const first = config.requestChange({ retain: true });
		const second = config.requestChange({ retain: false });
		assert.equal(config.current.revision, 0);
		const proposals = [...submitted];
		assert.equal(proposals.length, 2);
		submitted.length = 0;
		for (const proposal of proposals) {
			delta.reSubmit(proposal.contents, proposal.metadata, true);
		}
		assert.deepEqual(submitted, proposals);
		delta.processMessages(
			collection(
				submitted.map((item) => item.contents),
				true,
				submitted.map((item) => item.metadata),
			),
		);
		const firstResult = await first;
		const secondResult = await second;
		assert.equal(firstResult.status, "applied");
		assert.equal(secondResult.status, "conflict");
		assert.equal(config.current.values.retain, true);
	});

	it("leaves ordinary edits from synchronous dirty listeners unwrapped on an attached channel", async () => {
		const events = new EventEmitter();
		const { runtime, delta, services, submitted } = harness(AttachState.Attached, () =>
			events.emit("dirty"),
		);
		const factory = makeKind({}).getFactory();
		const shared = factory.create(runtime, "reentrant");
		const remote = harness();
		const peer = await factory.load(
			remote.runtime,
			"peer",
			remote.services,
			shared.attributes,
		);
		shared.connect(services);
		const config = requireConfig(shared);
		const contents = { edit: "from dirty event" };
		const metadata = { origin: "dirty listener" };
		events.once("dirty", () => shared.edit(contents, metadata));

		const request = config.requestChange({ retain: true });
		assert.equal(submitted.length, 2);
		assert.deepEqual(submitted[0]?.contents, barrier(0, true));
		assert.deepEqual(submitted[1]?.contents, contents);
		assert.equal(submitted[1]?.metadata, metadata);
		assert.equal(config.current.revision, 0);
		assert.deepEqual(shared.observed.at(-1), ["optimistic", contents]);

		delta.processMessages(
			collection(
				submitted.map((message) => message.contents),
				true,
				submitted.map((message) => message.metadata),
			),
		);
		const result = await request;
		assert.equal(result.status, "applied");
		assert.deepEqual(shared.observed.at(-1), ["operation", contents, metadata, 1, true]);
		remote.delta.processMessages(collection(submitted.map((message) => message.contents)));
		assert.deepEqual(peer.observed.at(-1), ["operation", contents, undefined, 1, false]);
	});

	it("keeps a rehydrated detached channel local until attaching", async () => {
		const { runtime, services, delta, submitted } = harness(AttachState.Detached);
		const factory = makeKind({}).getFactory();
		const base = factory.create(runtime, "base");
		await requireConfig(base).requestChange({ retain: true });
		const attributes = JSON.parse(JSON.stringify(base.attributes)) as IChannelAttributes;
		const shared = await makeKind().getFactory().load(runtime, "loaded", services, attributes);
		const config = requireConfig(shared);
		assert.equal(config.current.values.retain, true);
		const local = config.requestChange({ retain: false });
		assert.equal(shared.isAttached(), false);
		assert.equal(config.current.revision, 2);
		const localResult = await local;
		assert.equal(localResult.source, "local");
		assert.equal(submitted.length, 0);
		runtime.setAttachState(AttachState.Attaching);
		const request = config.requestChange({});
		assert.equal(config.current.revision, 2);
		const proposal = submitted[0];
		assert(proposal !== undefined);
		delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
		const result = await request;
		assert.equal(result.source, "sequenced");
		assert.equal(config.current.revision, 3);
	});

	it("restores configuration intent without activation and rejects rollback, read-only and disposal", async () => {
		const { runtime, delta, services, submitted } = harness();
		const factory = makeKind().getFactory();
		const shared = await factory.load(runtime, "loaded", services, factory.attributes);
		const config = requireConfig(shared);
		delta.applyStashedOp(barrier(0, true));
		assert.equal(config.current.revision, 0);
		assert(!("configuration" in shared.attributes));
		assert.deepEqual(submitted[0]?.contents, barrier(0, true));
		const rollback = config.requestChange({ retain: true });
		const last = submitted.at(-1);
		assert(last !== undefined);
		delta.rollback?.(last.contents, last.metadata);
		await assert.rejects(rollback, /rolled back/);
		assert(!("configuration" in shared.attributes));
		runtime.notifyReadOnlyState(true);
		await assert.rejects(config.requestChange({}), /read-only/);
		runtime.notifyReadOnlyState(false);
		const pending = config.requestChange({});
		runtime.dispose();
		await assert.rejects(pending, /disposed/);
		await assert.rejects(config.requestChange({}), /disposed/);
	});

	it("keeps per-instance configuration replacements separate from factory defaults", async () => {
		const { runtime } = harness(AttachState.Detached);
		const initial = { retain: false };
		const factory = makeKind(initial).getFactory();
		const one = factory.create(runtime, "one");
		const two = factory.create(runtime, "two");
		assert.equal(requireConfig(one).current.values, initial);
		assert.equal(requireConfig(two).current.values, initial);
		await requireConfig(one).requestChange({ retain: true });
		assert.equal(requireConfig(two).current.values.retain, false);
		assert(!("configuration" in factory.attributes));
		assert.notEqual(one.attributes, two.attributes);
		assert.notEqual(one.attributes, factory.attributes);
		assert.equal(Object.isFrozen(one.attributes), false);
	});

	it("keeps DDSes without a configuration definition on the existing protocol", async () => {
		const { runtime, services } = harness(AttachState.Detached);
		const factory = makeKind(undefined, false).getFactory();
		const shared = factory.create(runtime, "unconfigured");
		assert.equal(shared.config, undefined);
		assert.equal(shared.attributes, factory.attributes);
		assert.deepEqual(shared.observed, [["initial", undefined]]);
		assert.equal(Object.isFrozen(factory.attributes), false);
		const loaded = await factory.load(runtime, "loaded", services, factory.attributes);
		for (const instance of [shared, loaded]) {
			assert.equal(sharedObjectProtocols.has(instance), false);
			assert.equal(getSharedObjectProtocol(instance), defaultSharedObjectProtocol);
			assert(!("channelConfigurationProtocolVersion" in instance));
			assert(!("configuration" in instance.attributes));
			assert.equal(instance.config, undefined);
		}
	});

	it("uses defaults without marking instances and persists the first identical local replacement", async () => {
		const { runtime, submitted } = harness(AttachState.Detached);
		const factory = makeKind(undefined, true, "configured-test", {
			configurationDefinition: {
				...definition,
				defaultConfiguration: { retain: false },
			},
		}).getFactory();
		const first = factory.create(runtime, "first");
		const second = factory.create(runtime, "second");
		assert.equal(sharedObjectProtocols.has(first), true);
		assert.notEqual(getSharedObjectProtocol(first), defaultSharedObjectProtocol);
		const config = requireConfig(first);
		assert.deepEqual(config.current, { revision: 0, values: { retain: false } });
		assert.deepEqual(first.observed, [["initial", config.current]]);
		assert(!("configuration" in first.attributes));
		first.getAttachSummary();
		assert(!("configuration" in first.attributes));
		config.on("changed", () => assert("configuration" in first.attributes));
		await config.requestChange({ retain: false });
		assert("configuration" in first.attributes);
		await config.requestChange({});
		assert("configuration" in first.attributes);
		assert(!("configuration" in second.attributes));
		assert(!("configuration" in factory.attributes));
		assert.equal(requireConfig(second).current.revision, 0);
		assert.deepEqual(submitted, []);
	});

	it("does not accept a configuration op before document capability is active", async () => {
		const { runtime, services, delta } = harness();
		runtime.isSharedObjectConfigurationEnabled = () => false;
		const factory = makeKind().getFactory();
		const shared = await factory.load(runtime, "existing", services, factory.attributes);
		assert.throws(
			() => delta.processMessages(collection([barrier(0, true)])),
			/capability is not enabled/,
		);
		assert.equal(requireConfig(shared).current.revision, 0);
		assert(!("configuration" in shared.attributes));
	});

	for (const lazy of [false, true]) {
		it(`rejects activation for a nonparticipating DDS during ${lazy ? "lazy replay" : "live processing"}`, async () => {
			const test = datastoreHarness(makeKind(undefined, false).getFactory());
			if (lazy) {
				test.process(barrier(0, true));
				await assert.rejects(test.runtime.getChannel("dds"), DataProcessingError);
			} else {
				await test.runtime.getChannel("dds");
				assert.equal(test.shared.config, undefined);
				test.process("ordinary");
				assert.throws(() => test.process(barrier(0, true)), DataProcessingError);
			}
			test.runtime.dispose();
		});
	}

	it("exposes revision and values in memory and encodes a version only in attributes", async () => {
		const { runtime, services } = harness(AttachState.Detached);
		const factory = makeKind({ retain: false }).getFactory();
		const original = factory.create(runtime, "original");
		for (const shared of [
			original,
			await factory.load(runtime, "loaded", services, original.attributes),
		]) {
			const config = requireConfig(shared);
			assert.deepEqual(config.current, { revision: 0, values: { retain: false } });
			assert.equal(Object.isFrozen(config.current), false);
			const initialAttributes = JSON.parse(JSON.stringify(shared.attributes)) as {
				configuration: unknown;
			};
			assert.deepEqual(initialAttributes.configuration, {
				version: 1,
				revision: 0,
				values: { retain: false },
			});
			const result = await config.requestChange({ retain: true });
			assert.deepEqual(result.current, { revision: 1, values: { retain: true } });
			const updatedAttributes = JSON.parse(JSON.stringify(shared.attributes)) as {
				configuration: unknown;
			};
			assert.deepEqual(updatedAttributes.configuration, {
				version: 1,
				revision: 1,
				values: { retain: true },
			});
		}
	});

	for (const attachState of [AttachState.Detached, AttachState.Attached]) {
		it(`rejects DDS submissions using the reserved marker (${attachState})`, () => {
			const { runtime, services, submitted } = harness(attachState);
			const shared = makeKind({}).getFactory().create(runtime, "configured");
			shared.connect(services);
			for (const isChannelConfigurationOp of [true, false, 1]) {
				assert.throws(
					() => shared.edit({ isChannelConfigurationOp, values: "private data" }),
					(error: unknown) => {
						assert(error instanceof DataProcessingError);
						assert(!error.message.includes("private data"));
						return true;
					},
				);
			}
			assert.equal(submitted.length, 0);
			assert.equal(requireConfig(shared).current.revision, 0);
		});
	}

	it("only permits the reserved marker for the controller's own submission", async () => {
		const { runtime, services, delta, submitted } = harness(AttachState.Attached, () => {
			assert.throws(() => shared.edit(barrier(0, false)), DataProcessingError);
		});
		const shared = makeKind({}).getFactory().create(runtime, "configured");
		shared.connect(services);
		const request = requireConfig(shared).requestChange({ retain: true });
		assert.equal(submitted.length, 1);
		const control = submitted[0];
		assert(control !== undefined);
		assert.deepEqual(control.contents, barrier(0, true));
		delta.processMessages(collection([control.contents], true, [control.metadata]));
		const result = await request;
		assert.equal(result.status, "applied");
	});

	it("preserves ordinary wire bytes and events for primitive, array and object payloads", () => {
		const { runtime, services, delta, submitted } = harness();
		const shared = makeKind({}).getFactory().create(runtime, "configured");
		shared.connect(services);
		const events: unknown[] = [];
		(shared as View & ISharedObject).on("op", (message) => events.push(message.contents));
		const payloads = [
			7,
			"ordinary",
			false,
			[1, { isChannelConfigurationOp: true }],
			{ version: 99, kind: "configuration", revision: 123, contents: {} },
			{ data: { isChannelConfigurationOp: true, expectedRevision: 0 } },
		];
		const metadata = { pending: true };
		for (const contents of payloads) {
			shared.edit(contents, metadata);
			const sent = submitted.at(-1);
			assert(sent !== undefined);
			assert.equal(JSON.stringify(sent.contents), JSON.stringify(contents));
			assert.equal(sent.metadata, metadata);
			delta.processMessages(collection([sent.contents], true, [metadata]));
			assert.deepEqual(shared.observed.at(-1), ["operation", contents, metadata, 0, true]);
		}
		assert.deepEqual(events, payloads);
		assert.equal(requireConfig(shared).current.revision, 0);
	});

	it("rejects invalid marked configuration ops instead of passing them to the DDS", () => {
		const { runtime, services, delta } = harness();
		const shared = makeKind({}).getFactory().create(runtime, "configured");
		shared.connect(services);
		for (const marker of [false, 1, undefined]) {
			assert.throws(
				() =>
					delta.processMessages(
						collection([
							{
								version: 1,
								isChannelConfigurationOp: marker,
								expectedRevision: 0,
								values: {},
							},
						]),
					),
				/Invalid channel configuration message/,
			);
		}
		assert.deepEqual(shared.observed, [["initial", { revision: 0, values: {} }]]);
	});

	it("loads both protocols with one reader factory and ignores new-instance defaults", async () => {
		const { runtime, services } = harness(AttachState.Detached);
		const original = makeKind({ retain: false }).getFactory().create(runtime, "original");
		await requireConfig(original).requestChange({ retain: true });
		const persisted = JSON.parse(JSON.stringify(original.attributes)) as IChannelAttributes;
		const reader = makeKind().getFactory();
		const loaded = await reader.load(runtime, "loaded", services, persisted);
		assert.notEqual(loaded.attributes, persisted);
		assert.equal(requireConfig(loaded).current.values.retain, true);
		assert.equal(requireConfig(loaded).current.revision, 1);
		await requireConfig(loaded).requestChange({});
		assert.equal(requireConfig(loaded).current.revision, 2);
		assert.deepEqual(persisted, JSON.parse(JSON.stringify(original.attributes)));
		const other = harness(AttachState.Detached);
		const legacy = await makeKind({ retain: true }, true, "configured-test", {
			configurationDefinition: {
				...definition,
				defaultConfiguration: { retain: false },
			},
		})
			.getFactory()
			.load(other.runtime, "legacy", other.services, reader.attributes);
		assert.deepEqual(requireConfig(legacy).current, {
			revision: 0,
			values: { retain: false },
		});
		assert(!("configuration" in legacy.attributes));
		assert.notEqual(legacy.attributes, reader.attributes);
	});

	it("rejects unsupported or malformed marked instances before constructing the kernel", async () => {
		const { runtime, services } = harness();
		const reader = makeKind(undefined, false).getFactory();
		const unsupportedAttributes: IChannelAttributes & { configuration: unknown } = {
			...reader.attributes,
			configuration: { version: 1, revision: 0, values: {} },
		};
		await assert.rejects(
			reader.load(runtime, "old", services, unsupportedAttributes),
			/configuration/i,
		);
		const supported = makeKind().getFactory();
		for (const configuration of [
			undefined,
			{ version: 2 },
			{ version: 1, revision: -1, values: {} },
		]) {
			const invalidAttributes: IChannelAttributes & { configuration: unknown } = {
				...supported.attributes,
				configuration,
			};
			await assert.rejects(
				supported.load(runtime, "bad", services, invalidAttributes),
				/configuration/i,
			);
		}
	});

	it("replays mixed batches in logical order and delivers raw ops and normal events", async () => {
		const { runtime, delta, services } = harness();
		const factory = makeKind().getFactory();
		const original = factory.create(runtime, "original");
		const shared = await factory.load(runtime, "loaded", services, original.attributes);
		assert(!("configuration" in shared.attributes));
		const events: unknown[] = [];
		const changes: ChannelConfigurationChange<Config>[] = [];
		requireConfig(shared).on("changed", (change) => changes.push(change));
		(shared as View & ISharedObject).on("op", (message) => events.push(message.contents));
		delta.processMessages(
			collection(["before", barrier(0, true), "older", barrier(1, false), "after"]),
		);
		assert.deepEqual(
			shared.observed.filter((item) => Array.isArray(item) && item[0] === "operation"),
			[
				["operation", "before", undefined, 0, false],
				["operation", "older", undefined, 1, false],
				["operation", "after", undefined, 2, false],
			],
		);
		assert.deepEqual(
			shared.observed.map((item): unknown => (Array.isArray(item) ? item[0] : item)),
			["initial", "operation", "configuration", "operation", "configuration", "operation"],
		);
		assert.deepEqual(events, ["before", "older", "after"]);
		assert.deepEqual(
			changes.map((change) => {
				assert.equal(change.source, "sequenced");
				assert(change.source === "sequenced");
				return [
					change.sequenceNumber,
					change.clientSequenceNumber,
					change.messageIndex,
					change.current.revision,
				];
			}),
			[
				[10, 2, 1, 1],
				[10, 4, 3, 2],
			],
		);
	});

	it("preserves raw DDS payloads through one-to-many replay and ordinary rollback", async () => {
		const { runtime, delta, services, submitted } = harness();
		const factory = makeKind({}).getFactory();
		const shared = await factory.load(
			runtime,
			"loaded",
			services,
			factory.create(runtime, "base").attributes,
		);
		delta.processMessages(collection([barrier(0, true)]));
		const metadata = { pending: true };
		delta.reSubmit("old", metadata, false);
		assert.deepEqual(submitted, [
			{ contents: { part: 1, contents: "old" }, metadata },
			{ contents: { part: 2, contents: "old" }, metadata },
		]);
		submitted.length = 0;
		delta.applyStashedOp("old");
		assert.deepEqual(submitted, [
			{ contents: { stashed: 1, contents: "old" }, metadata: "restored-one" },
			{ contents: { stashed: 2, contents: "old" }, metadata: "restored-two" },
		]);
		delta.rollback?.("old", metadata);
		assert.deepEqual(shared.observed.at(-1), ["rollback", "old", metadata]);
		shared.edit("new", metadata);
		assert.deepEqual(submitted.at(-1), { contents: "new", metadata });
	});

	it("preserves optimistic edits, handle encoding and local acknowledgement metadata", async () => {
		const { runtime, delta, services, submitted } = harness();
		const factory = makeKind({}).getFactory();
		const shared = await factory.load(
			runtime,
			"loaded",
			services,
			factory.create(runtime, "base").attributes,
		);
		const handle = new MockHandle("value");
		const metadata = { local: true };
		shared.edit({ handle }, metadata);
		assert.deepEqual(shared.observed.at(-1), ["optimistic", { handle }]);
		assert.equal(submitted.length, 1);
		delta.processMessages(collection([barrier(0, true)]));
		const submittedOp = submitted[0];
		assert(submittedOp !== undefined);
		delta.processMessages(collection([submittedOp.contents], true, [metadata]));
		const observed = shared.observed.at(-1);
		assert(Array.isArray(observed));
		assert.equal(observed[0], "operation");
		assert.equal(observed[2], metadata);
		assert.equal(observed[3], 1);
		assert.equal(observed[4], true);
		const processed: unknown = observed[1];
		assert(typeof processed === "object" && processed !== null && "handle" in processed);
		assert(isFluidHandle(processed.handle));
	});
});
