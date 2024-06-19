/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";

import {
	type IProvideRuntimeAttributor,
	enableOnNewFileKey,
	type IAttributor,
	AttributorSerializer,
	chain,
	deltaEncoder,
	makeLZ4Encoder,
	Attributor,
} from "@fluidframework/attributor/internal";
import {
	AttachState,
	type ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
	type IAudience,
	type IContainerContext,
} from "@fluidframework/container-definitions/internal";
import { type ConfigTypes, type FluidObject } from "@fluidframework/core-interfaces";
import {
	type IDocumentStorageService,
	type ISnapshotTree,
	type ISequencedDocumentMessage,
	SummaryType,
	type IQuorumClients,
	type ISequencedClient,
	type IClient,
} from "@fluidframework/driver-definitions/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import {
	MockLogger,
	sessionStorageConfigProvider,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaManager,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";

import { ContainerRuntime } from "../../index.js";

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

/**
 * Creates a mock {@link @fluidframework/protocol-definitions#IQuorumClients} for testing.
 */
export function makeMockQuorum(clientIds: string[]): IQuorumClients {
	const clients = new Map<string, ISequencedClient>();
	for (const [index, clientId] of clientIds.entries()) {
		const stringId = String.fromCharCode(index + 65);
		const name = stringId.repeat(10);
		const userId = `${name}@microsoft.com`;
		const email = userId;
		const user = {
			id: userId,
			name,
			email,
		};
		clients.set(clientId, {
			client: {
				mode: "write",
				details: { capabilities: { interactive: true } },
				permission: [],
				user,
				scopes: [],
			},
			sequenceNumber: 0,
		});
	}
	return new MockQuorumClients(...clients.entries());
}

/**
 * Creates a mock {@link @fluidframework/container-definitions#IAudience} for testing.
 */
export function makeMockAudience(clientIds: string[]): IAudience {
	const clients = new Map<string, IClient>();
	for (const [index, clientId] of clientIds.entries()) {
		const stringId = String.fromCharCode(index + 65);
		const name = stringId.repeat(10);
		const userId = `${name}@microsoft.com`;
		const email = userId;
		const user = {
			id: userId,
			name,
			email,
		};
		clients.set(clientId, {
			mode: "write",
			details: { capabilities: { interactive: true } },
			permission: [],
			user,
			scopes: [],
		});
	}
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return {
		getMember: (clientId: string): IClient | undefined => {
			return clients.get(clientId);
		},
	} as IAudience;
}

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
			user: context.quorum?.getMember(op.clientId!)?.client.user,
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
			user: context.quorum?.getMember(op.clientId!)?.client.user,
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
				{
					timestamp: op.timestamp!,
					user: context.quorum.getMember(op.clientId!)!.client.user,
				},
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
			user: context.quorum?.getMember(op.clientId!)?.client.user,
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
