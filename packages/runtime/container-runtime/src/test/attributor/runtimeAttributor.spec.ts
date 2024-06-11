/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";

import { AttachState, type ICriticalContainerError } from "@fluidframework/container-definitions";
import { type IContainerContext } from "@fluidframework/container-definitions/internal";
import { type ConfigTypes, type FluidObject } from "@fluidframework/core-interfaces";
import {
	type IDocumentStorageService,
	type ISnapshotTree,
	type ISequencedDocumentMessage,
	SummaryType,
} from "@fluidframework/driver-definitions/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import { MockLogger, sessionStorageConfigProvider } from "@fluidframework/telemetry-utils/internal";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils/internal";

import {
	type IProvideRuntimeAttributor,
	enableOnNewFileKey,
	Attributor,
	AttributorSerializer,
	chain,
	deltaEncoder,
	makeLZ4Encoder,
	type IAttributor,
} from "../../attributor/index.js";
import { ContainerRuntime } from "../../index.js";

import { makeMockAudience, makeMockQuorum } from "./utils.js";

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

describe("RuntimeAttributor", () => {
	const clientId = "mock client id";
	const getMockContext = (): Partial<IContainerContext> => {
		return {
			audience: makeMockAudience([clientId]),
			attachState: AttachState.Attached,
			deltaManager: new MockDeltaManager(),
			quorum: makeMockQuorum([clientId]),
			taggedLogger: new MockLogger(),
			clientDetails: { capabilities: { interactive: true } },
			closeFn: (error?: ICriticalContainerError): void => {
				if (error) {
					// eslint-disable-next-line @typescript-eslint/no-throw-literal
					throw error;
				}
			},
			options: {},
			updateDirtyContainerState: (_dirty: boolean): void => {},
			getLoadedFromVersion: () => undefined,
		};
	};

	const oldRawConfig = sessionStorageConfigProvider.value.getRawConfig;
	let injectedSettings: Record<string, ConfigTypes> = {};

	before(() => {
		sessionStorageConfigProvider.value.getRawConfig = (name): ConfigTypes =>
			injectedSettings[name];
	});

	afterEach(() => {
		injectedSettings = {};
	});

	after(() => {
		sessionStorageConfigProvider.value.getRawConfig = oldRawConfig;
	});

	const setEnableOnNew = (val: boolean): void => {
		injectedSettings[enableOnNewFileKey] = val;
	};

	it("Attributes ops", async () => {
		setEnableOnNew(true);
		const context = getMockContext() as IContainerContext;
		const containerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries: [],
			existing: false,
			runtimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableRuntimeIdCompressor: "on",
			},
			provideEntryPoint: async () => ({}),
		});

		const maybeProvidesAttributor: FluidObject<IProvideRuntimeAttributor> =
			containerRuntime.IRuntimeAttributor;
		assert(maybeProvidesAttributor.IRuntimeAttributor !== undefined);
		const runtimeAttribution = maybeProvidesAttributor.IRuntimeAttributor;

		const op: Partial<ISequencedDocumentMessage> = {
			type: "op",
			sequenceNumber: 7,
			clientId,
			timestamp: 1006,
		};

		(context.deltaManager as MockDeltaManager).emit("op", op);

		assert.deepEqual(runtimeAttribution.get({ type: "op", seq: op.sequenceNumber! }), {
			timestamp: op.timestamp,
			user: context.audience?.getMember(op.clientId!)?.user,
		});
	});

	it("includes attribution association data in the summary tree", async () => {
		setEnableOnNew(true);
		const context = getMockContext() as IContainerContext;
		const containerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries: [],
			existing: false,
			runtimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableRuntimeIdCompressor: "on",
			},
			provideEntryPoint: async () => ({}),
		});

		const op: Partial<ISequencedDocumentMessage> = {
			type: "op",
			sequenceNumber: 7,
			clientId,
			timestamp: 1006,
		};

		(context.deltaManager as MockDeltaManager).emit("op", op);
		const { summary } = await containerRuntime.summarize({
			fullTree: true,
			runGC: false,
		});

		const { ".attributor": attributor } = summary.tree;
		assert(
			attributor !== undefined && attributor.type === SummaryType.Tree,
			"summary should contain attributor data",
		);
		const opAttributorBlob = attributor.tree.op;
		assert(
			opAttributorBlob.type === SummaryType.Blob &&
				typeof opAttributorBlob.content === "string",
		);
		const decoder = chain(
			new AttributorSerializer(
				(entries) => new Attributor(entries) as IAttributor,
				deltaEncoder,
			),
			makeLZ4Encoder(),
		);
		const decoded = decoder.decode(opAttributorBlob.content);
		assert.deepEqual(decoded.getAttributionInfo(op.sequenceNumber!), {
			timestamp: op.timestamp,
			user: context.audience?.getMember(op.clientId!)?.user,
		});
	});

	it("repopulates attribution association data using the summary tree", async () => {
		const op: Partial<ISequencedDocumentMessage> = {
			sequenceNumber: 7,
			clientId,
			timestamp: 1006,
		};

		const encoder = chain(
			new AttributorSerializer(
				(entries) => new Attributor(entries) as IAttributor,
				deltaEncoder,
			),
			makeLZ4Encoder(),
		);
		const context = getMockContext() as Mutable<IContainerContext>;
		const sampleAttributor = new Attributor([
			[
				op.sequenceNumber!,
				{ timestamp: op.timestamp!, user: context.audience.getMember(op.clientId!)!.user },
			],
		]);

		const opAttributorBlobId = "mock attributor blob id";
		const mockStorage: IDocumentStorageService = {
			readBlob: async (blobId: string): Promise<string> => {
				assert(blobId === opAttributorBlobId);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return encoder.encode(sampleAttributor);
			},
		} as unknown as IDocumentStorageService;
		const snapshot: ISnapshotTree = {
			blobs: {},
			trees: {
				".attributor": {
					blobs: { op: opAttributorBlobId },
					trees: {},
				},
			},
		};
		context.baseSnapshot = snapshot;
		context.storage = mockStorage;
		setEnableOnNew(true);
		const containerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries: [],
			existing: false,
			runtimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableRuntimeIdCompressor: "on",
			},
			provideEntryPoint: async () => ({}),
		});

		const maybeProvidesAttributor: FluidObject<IProvideRuntimeAttributor> =
			containerRuntime.IRuntimeAttributor;
		assert(maybeProvidesAttributor.IRuntimeAttributor !== undefined);
		const runtimeAttribution = maybeProvidesAttributor.IRuntimeAttributor;

		assert.deepEqual(runtimeAttribution.get({ type: "op", seq: op.sequenceNumber! }), {
			timestamp: op.timestamp,
			user: context.audience?.getMember(op.clientId!)?.user,
		});
	});

	describe("Doesn't summarize attributor", () => {
		const testCases: { getContext: () => IContainerContext; testName: string }[] = [
			{
				testName: "for existing documents that had no attributor",
				getContext: (): IContainerContext => {
					setEnableOnNew(true);
					const context = getMockContext() as Mutable<IContainerContext>;
					const snapshot: ISnapshotTree = {
						blobs: {},
						trees: {},
					};
					context.baseSnapshot = snapshot;
					return context;
				},
			},
			{
				testName: `for new documents with ${enableOnNewFileKey} unset`,
				getContext: (): IContainerContext => {
					return getMockContext() as IContainerContext;
				},
			},
			{
				testName: `for new documents with ${enableOnNewFileKey} set to false`,
				getContext: (): IContainerContext => {
					setEnableOnNew(false);
					const context = getMockContext() as Mutable<IContainerContext>;
					const snapshot: ISnapshotTree = {
						blobs: {},
						trees: {},
					};
					context.baseSnapshot = snapshot;
					return context;
				},
			},
		];

		for (const { getContext, testName } of testCases) {
			it(testName, async () => {
				const context = getContext();
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: async () => ({}),
				});

				const { summary } = await containerRuntime.summarize({
					fullTree: true,
					runGC: false,
				});
				assert(summary.tree[".attributor"] === undefined);
			});
		}
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
