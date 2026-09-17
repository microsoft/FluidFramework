/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IChannel,
	IChannelAttributes,
	IChannelServices,
	ChannelConfigurationChannel,
} from "@fluidframework/datastore-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeMessageCollection,
	IRuntimeStorageService,
	ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockFluidDataStoreContext,
	MockHandle,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type {
	ChannelConfigurationDefinition,
	ChannelConfigurationFacet,
	ChannelConfigurationChange,
} from "../channelConfiguration.js";
import type { ISharedObjectKind, SharedObjectKindAlpha } from "../sharedObject.js";
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
				for (const message of messages.messagesContent) {
					observed.push([
						"operation",
						message.contents,
						message.localOpMetadata,
						message.configurationRevision,
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
		type: "configured-test",
		attributes: { type: "configured-test", snapshotFormatVersion: "1" },
		telemetryContextPrefix: "configured-test",
		factory: {
			...(support ? { configurationDefinition: definition } : {}),
			create,
			loadCore: async (args) => create(args),
		},
		...(initialConfiguration === undefined ? {} : { initialConfiguration }),
	});
}

interface Harness {
	readonly runtime: MockFluidDataStoreRuntime & {
		channelConfigurationCreationEnabled: boolean;
		channelConfigurationEnabled: boolean;
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
		channelConfigurationCreationEnabled: true,
		channelConfigurationEnabled: true,
	});
	Object.defineProperty(runtime.deltaManagerInternal, "maxMessageSize", {
		value: 1024 * 1024,
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

function operation(contents: unknown, revision: number = 0): unknown {
	return { version: 1, kind: "operation", revision, contents };
}

function barrier(expectedRevision: number, retain: boolean): unknown {
	return { version: 1, kind: "configuration", expectedRevision, values: { retain } };
}

function requireConfig(view: View): ChannelConfigurationFacet<Config> {
	assert(view.config !== undefined);
	return view.config;
}

function publish(shared: IChannel): void {
	const configured = shared as IChannel & ChannelConfigurationChannel;
	assert(configured.onChannelConfigurationPublication !== undefined);
	configured.onChannelConfigurationPublication();
}

describe("configured kernel composition", () => {
	it("initializes from snapshot and replays lazy datastore barriers before exposure and summary", async () => {
		const factory = makeKind({ retain: false }).getFactory();
		const baseline = factory.create(harness(AttachState.Detached).runtime, "baseline");
		const attributes = JSON.stringify(baseline.attributes);
		const context = new MockFluidDataStoreContext("store", true);
		context.isLocalDataStore = false;
		context.attachState = AttachState.Attached;
		context.containerRuntime = Object.assign(context.containerRuntime, {
			channelConfigurationEnabled: true,
			channelConfigurationCreationEnabled: false,
			channelConfigurationPublicationRequired: true,
		});
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
			operation("snapshot configuration"),
			barrier(0, true),
			operation("earlier revision"),
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
		const loaded = (await runtime.getChannel("dds")) as IChannel & View;
		assert.equal(factoryLookups, 1);
		assert.equal(requireConfig(loaded).current.revision, 2);
		assert.deepEqual(
			loaded.observed.map((item): unknown => (Array.isArray(item) ? item[0] : item)),
			["initial", "operation", "configuration", "operation", "configuration"],
		);
		const restoredOperation = { address: "dds", contents: operation("stashed earlier") };
		const restoredMetadata = await runtime.applyStashedOp({
			type: "op",
			content: restoredOperation,
		});
		assert(runtime.isDirty);
		runtime.processMessages(collection([restoredOperation], true, [restoredMetadata]));
		assert.equal(runtime.isDirty, false);
		assert.deepEqual(loaded.observed.slice(-2), [
			["operation", { stashed: 1, contents: "stashed earlier" }, "restored-one", 0, 2, true],
			["operation", { stashed: 2, contents: "stashed earlier" }, "restored-two", 0, 2, true],
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
		const { runtime, submitted } = harness();
		const shared = makeKind({}).getFactory().create(runtime, "unbound");
		const result = await requireConfig(shared).requestChange({ retain: true });
		assert.equal(result.source, "local");
		assert.deepEqual(submitted, []);
	});

	it("requires creation opt-in but not document-schema readiness for local configuration", async () => {
		const { runtime } = harness(AttachState.Detached);
		runtime.channelConfigurationCreationEnabled = false;
		assert.throws(() => makeKind({}).getFactory().create(runtime, "dark"), /creation/i);
		runtime.channelConfigurationCreationEnabled = true;
		runtime.channelConfigurationEnabled = false;
		const shared = makeKind({}).getFactory().create(runtime, "local");
		await requireConfig(shared).requestChange({ retain: true });
		assert.throws(() => publish(shared), /capability/i);
		assert.equal(requireConfig(shared).current.values.retain, true);
	});

	it("captures latest local state and queues later changes until attachment without changing the baseline", async () => {
		const { runtime, services, submitted, delta } = harness(AttachState.Detached);
		const shared = makeKind({}).getFactory().create(runtime, "attaching");
		const config = requireConfig(shared);
		await config.requestChange({ retain: true });
		shared.getAttachSummary();
		const baseline = JSON.stringify(shared.attributes);
		publish(shared);
		const change = config.requestChange({ retain: false });
		shared.edit("after snapshot");
		assert.equal(config.current.values.retain, true);
		assert.equal(JSON.stringify(shared.attributes), baseline);
		assert.equal(submitted.length, 0);
		shared.connect(services);
		runtime.setAttachState(AttachState.Attaching);
		assert.equal(submitted.length, 2);
		const proposal = submitted[0];
		assert(proposal !== undefined);
		assert.deepEqual(proposal.contents, barrier(1, false));
		assert.deepEqual(submitted[1]?.contents, operation("after snapshot", 1));
		delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
		const result = await change;
		assert.equal(result.source, "sequenced");
		assert.equal(config.current.values.retain, false);
	});

	it("keeps disconnected published requests pending and preserves CAS completion through replay", async () => {
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

	for (const queued of [false, true]) {
		it(`envelopes ordinary edits from synchronous dirty listeners during ${queued ? "queued" : "immediate"} control submission`, async () => {
			const events = new EventEmitter();
			const { runtime, delta, services, submitted } = harness(AttachState.Attached, () =>
				events.emit("dirty"),
			);
			const factory = makeKind({}).getFactory();
			const shared = factory.create(runtime, "reentrant");
			publish(shared);
			const remote = harness();
			const peer = await factory.load(
				remote.runtime,
				"peer",
				remote.services,
				shared.attributes,
			);
			if (!queued) {
				shared.connect(services);
			}
			const config = requireConfig(shared);
			const contents = { edit: "from dirty event" };
			const metadata = { origin: "dirty listener" };
			events.once("dirty", () => shared.edit(contents, metadata));

			const request = config.requestChange({ retain: true });
			if (queued) {
				assert.equal(submitted.length, 0);
				shared.connect(services);
			}
			assert.equal(submitted.length, 2);
			assert.deepEqual(submitted[0]?.contents, barrier(0, true));
			assert.deepEqual(submitted[1]?.contents, operation(contents));
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
			assert.deepEqual(shared.observed.at(-1), ["operation", contents, metadata, 0, 1, true]);
			remote.delta.processMessages(collection(submitted.map((message) => message.contents)));
			assert.deepEqual(peer.observed.at(-1), ["operation", contents, undefined, 0, 1, false]);
		});
	}

	it("queues published changes while bound but not yet connected to services", async () => {
		const { runtime, services, submitted, delta } = harness();
		const shared = makeKind({}).getFactory().create(runtime, "bound");
		(shared as View & ISharedObject).bindToContext();
		assert(shared.isAttached());
		publish(shared);
		const request = requireConfig(shared).requestChange({ retain: true });
		shared.edit("before services");
		assert.equal(submitted.length, 0);
		shared.connect(services);
		assert.equal(submitted.length, 2);
		const proposal = submitted[0];
		assert(proposal !== undefined);
		assert.deepEqual(submitted[1]?.contents, operation("before services"));
		delta.processMessages(collection([proposal.contents], true, [proposal.metadata]));
		const result = await request;
		assert.equal(result.status, "applied");
	});

	it("uses container publication state when a loaded datastore still reports detached", async () => {
		const { runtime, services, submitted } = harness(AttachState.Detached);
		const factory = makeKind({}).getFactory();
		const base = factory.create(runtime, "base");
		Object.assign(runtime, { channelConfigurationPublicationRequired: true });
		const shared = await factory.load(runtime, "loaded", services, base.attributes);
		const config = requireConfig(shared);
		const request = config.requestChange({ retain: true });
		assert.equal(config.current.revision, 0);
		assert.equal(submitted.length, 0);
		runtime.dispose();
		await assert.rejects(request, /disposed/);
	});

	it("restores configuration intent without activation and rejects rollback, read-only and disposal", async () => {
		const { runtime, delta, services, submitted } = harness();
		const factory = makeKind({}).getFactory();
		const shared = await factory.load(
			runtime,
			"loaded",
			services,
			factory.create(runtime, "base").attributes,
		);
		const config = requireConfig(shared);
		delta.applyStashedOp(barrier(0, true));
		assert.equal(config.current.revision, 0);
		assert.deepEqual(submitted[0]?.contents, barrier(0, true));
		const rollback = config.requestChange({ retain: true });
		const last = submitted.at(-1);
		assert(last !== undefined);
		delta.rollback?.(last.contents, last.metadata);
		await assert.rejects(rollback, /rolled back/);
		runtime.notifyReadOnlyState(true);
		await assert.rejects(config.requestChange({}), /read-only/);
		runtime.notifyReadOnlyState(false);
		const pending = config.requestChange({});
		runtime.dispose();
		await assert.rejects(pending, /disposed/);
		await assert.rejects(config.requestChange({}), /disposed/);
	});

	it("does not share state with factory attributes or another instance", async () => {
		const { runtime } = harness(AttachState.Detached);
		const initial = { retain: false };
		const factory = makeKind(initial).getFactory();
		const one = factory.create(runtime, "one");
		const two = factory.create(runtime, "two");
		initial.retain = true;
		await requireConfig(one).requestChange({ retain: true });
		assert.equal(requireConfig(two).current.values.retain, false);
		assert(!("configuration" in factory.attributes));
		assert.notEqual(one.attributes, two.attributes);
	});

	it("loads both protocols with one reader factory and ignores new-instance defaults", async () => {
		const { runtime, services } = harness(AttachState.Detached);
		const original = makeKind({ retain: false }).getFactory().create(runtime, "original");
		await requireConfig(original).requestChange({ retain: true });
		const persisted = JSON.parse(JSON.stringify(original.attributes)) as IChannelAttributes;
		const reader = makeKind().getFactory();
		runtime.channelConfigurationCreationEnabled = false;
		const loaded = await reader.load(runtime, "loaded", services, persisted);
		assert.equal(requireConfig(loaded).current.values.retain, true);
		assert.equal(requireConfig(loaded).current.revision, 1);
		await requireConfig(loaded).requestChange({});
		assert.equal(requireConfig(loaded).current.revision, 2);
		const other = harness(AttachState.Detached);
		const legacy = await makeKind({ retain: true })
			.getFactory()
			.load(other.runtime, "legacy", other.services, reader.attributes);
		assert.equal(legacy.config, undefined);
		assert(!("configuration" in legacy.attributes));
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

	it("replays mixed batches in logical order and delivers earlier revisions and normal events", async () => {
		const { runtime, delta, services } = harness();
		const factory = makeKind({ retain: false }).getFactory();
		const original = factory.create(runtime, "original");
		const shared = await factory.load(runtime, "loaded", services, original.attributes);
		const events: unknown[] = [];
		const changes: ChannelConfigurationChange<Config>[] = [];
		requireConfig(shared).on("changed", (change) => changes.push(change));
		(shared as View & ISharedObject).on("op", (message) => events.push(message.contents));
		delta.processMessages(
			collection([
				operation("before"),
				barrier(0, true),
				operation("older"),
				barrier(1, false),
				operation("after", 2),
			]),
		);
		assert.deepEqual(
			shared.observed.filter((item) => Array.isArray(item) && item[0] === "operation"),
			[
				["operation", "before", undefined, 0, 0, false],
				["operation", "older", undefined, 0, 1, false],
				["operation", "after", undefined, 2, 2, false],
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

	it("preserves original revision through one-to-many replay and ordinary rollback", async () => {
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
		delta.reSubmit(operation("old"), metadata, false);
		assert.deepEqual(submitted, [
			{ contents: operation({ part: 1, contents: "old" }), metadata },
			{ contents: operation({ part: 2, contents: "old" }), metadata },
		]);
		submitted.length = 0;
		delta.applyStashedOp(operation("old"));
		assert.deepEqual(submitted, [
			{ contents: operation({ stashed: 1, contents: "old" }), metadata: "restored-one" },
			{ contents: operation({ stashed: 2, contents: "old" }), metadata: "restored-two" },
		]);
		delta.rollback?.(operation("old"), metadata);
		assert.deepEqual(shared.observed.at(-1), ["rollback", "old", metadata]);
		shared.edit("new", metadata);
		assert.deepEqual(submitted.at(-1), { contents: operation("new", 1), metadata });
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
		assert.equal(observed[3], 0);
		assert.equal(observed[4], 1);
		assert.equal(observed[5], true);
		const processed: unknown = observed[1];
		assert(typeof processed === "object" && processed !== null && "handle" in processed);
		assert(isFluidHandle(processed.handle));
	});
});
