/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	stringToBuffer,
	TypedEventEmitter,
	type IProvideLayerCompatDetails,
} from "@fluid-internal/client-utils";
import {
	isIDeltaManagerFull,
	type ICodeDetailsLoader,
	type IRuntime,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	type IDocumentDeltaStorageService,
	type IDocumentDeltaConnection,
	type IDocumentDeltaConnectionEvents,
	type IDocumentMessage,
	type IDocumentService,
	type IDocumentServiceFactory,
	type IDocumentStorageService,
	type IClientConfiguration,
	type IResolvedUrl,
	type ISignalClient,
	type ISignalMessage,
	type ISequencedDocumentMessage,
	type ISnapshot,
	type ISnapshotFetchOptions,
	type ISnapshotTree,
	type ITokenClaims,
	type IStream,
	type IStreamResult,
	type IVersion,
	type ConnectionMode,
	MessageType,
	SummaryType,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { loadContainerPaused } from "../loadPaused.js";
import type { ILoaderProps } from "../loader.js";
import {
	loadContainerToSequenceNumber,
	type ILoadContainerToSequenceNumberProps,
} from "../createAndLoadContainerUtils.js";

import { AbsentProperty, failSometimeProxy } from "./failProxy.js";

const resolvedUrl: IResolvedUrl = {
	id: "paused-load-test-id",
	endpoints: {},
	tokens: {},
	type: "fluid",
	url: "fluid://localhost/tenant/paused-load-test-id",
};

const request: IRequest = { url: resolvedUrl.url };

function createSnapshot(sequenceNumber: number): ISnapshot {
	const snapshotTree: ISnapshotTree = {
		id: `snapshot-${sequenceNumber}`,
		blobs: {},
		trees: {
			".protocol": {
				blobs: {
					attributes: "attributes",
					quorumMembers: "quorumMembers",
					quorumProposals: "quorumProposals",
					quorumValues: "quorumValues",
				},
				trees: {},
			},
			".app": {
				blobs: {},
				trees: {},
			},
		},
	};

	return {
		blobContents: new Map([
			[
				"attributes",
				stringToBuffer(JSON.stringify({ minimumSequenceNumber: 0, sequenceNumber }), "utf8"),
			],
			["quorumMembers", stringToBuffer(JSON.stringify([]), "utf8")],
			["quorumProposals", stringToBuffer(JSON.stringify([]), "utf8")],
			[
				"quorumValues",
				stringToBuffer(
					JSON.stringify([
						[
							"code",
							{
								key: "code",
								value: { package: "paused-load-test" },
								approvalSequenceNumber: 0,
								commitSequenceNumber: 0,
								sequenceNumber: 0,
							},
						],
					]),
					"utf8",
				),
			],
		]),
		latestSequenceNumber: undefined,
		ops: [],
		sequenceNumber,
		snapshotTree,
		snapshotFormatV: 1,
	};
}

function createMessage(sequenceNumber: number): ISequencedDocumentMessage {
	return {
		// eslint-disable-next-line unicorn/no-null
		clientId: null,
		clientSequenceNumber: -1,
		contents: undefined,
		minimumSequenceNumber: 0,
		referenceSequenceNumber: sequenceNumber - 1,
		sequenceNumber,
		timestamp: sequenceNumber,
		type: MessageType.NoOp,
	};
}

class TestDeltaConnection
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection
{
	public readonly claims: ITokenClaims = {
		documentId: resolvedUrl.id,
		exp: Math.round(Date.now() / 1000) + 60 * 60,
		iat: Math.round(Date.now() / 1000),
		scopes: ["doc:read"],
		tenantId: "tenantId",
		user: { id: "paused-load-test-user" },
		ver: "1.0",
	};

	public readonly mode: ConnectionMode = "read";
	public readonly existing = true;
	public readonly version = "";
	public readonly initialSignals: ISignalMessage[] = [];
	public readonly initialClients: ISignalClient[] = [];
	public readonly serviceConfiguration: IClientConfiguration = {
		blockSize: 64 * 1024,
		maxMessageSize: 16 * 1024,
	};
	public disposed = false;

	public constructor(
		public readonly clientId: string,
		public readonly initialMessages: ISequencedDocumentMessage[],
	) {
		super();
	}

	public submit(_messages: IDocumentMessage[]): void {}

	public submitSignal(_content: string, _targetClientId?: string): void {}

	public dispose(): void {
		this.disposed = true;
	}
}

function streamFromMessages(
	messages: ISequencedDocumentMessage[],
): IStream<ISequencedDocumentMessage[]> {
	let readCount = 0;
	return {
		read: async (): Promise<IStreamResult<ISequencedDocumentMessage[]>> => {
			if (readCount++ === 0) {
				return { done: false, value: messages };
			}
			return { done: true };
		},
	};
}

function createCodeLoader(): ICodeDetailsLoader {
	return {
		load: async () => ({
			details: { package: "paused-load-test" },
			module: {
				fluidExport: {
					IRuntimeFactory: {
						get IRuntimeFactory(): IRuntimeFactory {
							return this;
						},
						async instantiateRuntime(): Promise<IRuntime> {
							return failSometimeProxy<IRuntime & IProvideLayerCompatDetails>({
								createSummary: () => ({ tree: {}, type: SummaryType.Tree }),
								disposed: false,
								getPendingLocalState: () => ({}),
								ILayerCompatDetails: AbsentProperty,
								process: () => {},
								setAttachState: () => {},
								setConnectionStatus: () => {},
							});
						},
					},
				},
			},
		}),
	};
}

function createLoaderProps(
	snapshotSequenceNumber: number,
	deltaMessages: ISequencedDocumentMessage[],
): {
	loaderProps: ILoaderProps;
	fetchRanges: { from: number; to: number | undefined }[];
	getDeltaStreamConnectionCount: () => number;
} {
	const snapshot = createSnapshot(snapshotSequenceNumber);
	const fetchRanges: { from: number; to: number | undefined }[] = [];
	let deltaStreamConnectionCount = 0;
	const storage: IDocumentStorageService = {
		policies: {},
		createBlob: async () => ({ id: "blob" }),
		downloadSummary: async () => ({ tree: {}, type: SummaryType.Tree }),
		getSnapshot: async (_options?: ISnapshotFetchOptions) => snapshot,
		getSnapshotTree: async (_version?: IVersion) => snapshot.snapshotTree,
		getVersions: async () => [],
		readBlob: async (id: string) => {
			const blob = snapshot.blobContents.get(id);
			assert(blob !== undefined, `Missing blob ${id}`);
			return blob;
		},
		uploadSummaryWithContext: async (_summary: ISummaryTree) => "summary",
	};
	const deltaStorage: IDocumentDeltaStorageService = {
		fetchMessages: (from: number, to: number | undefined) => {
			fetchRanges.push({ from, to });
			return streamFromMessages(
				deltaMessages.filter(
					(message) =>
						message.sequenceNumber >= from &&
						(to === undefined || message.sequenceNumber < to),
				),
			);
		},
	};
	const service = failSometimeProxy<IDocumentService>({
		policies: {},
		resolvedUrl,
		connectToDeltaStorage: async () => deltaStorage,
		connectToDeltaStream: async () => {
			deltaStreamConnectionCount++;
			return new TestDeltaConnection("paused-load-client", deltaMessages);
		},
		connectToStorage: async () => storage,
		dispose: () => {},
		off: (): IDocumentService => service,
		on: (): IDocumentService => service,
		once: (): IDocumentService => service,
	});
	const documentServiceFactory = failSometimeProxy<
		IDocumentServiceFactory & IProvideLayerCompatDetails
	>({
		createContainer: async () => {
			throw new Error("not used in this test");
		},
		createDocumentService: async () => service,
		ILayerCompatDetails: AbsentProperty,
	});

	return {
		fetchRanges,
		getDeltaStreamConnectionCount: () => deltaStreamConnectionCount,
		loaderProps: {
			codeLoader: createCodeLoader(),
			documentServiceFactory,
			logger: new MockLogger(),
			options: {},
			scope: {},
			urlResolver: {
				getAbsoluteUrl: async () => resolvedUrl.url,
				resolve: async () => resolvedUrl,
			},
		},
	};
}

describe("loadContainerPaused", () => {
	it("replays forward from a historical snapshot and pauses at the target sequence number", async () => {
		const { loaderProps, fetchRanges, getDeltaStreamConnectionCount } = createLoaderProps(5, [
			createMessage(6),
			createMessage(7),
			createMessage(8),
		]);

		const container = await loadContainerPaused(loaderProps, request, 7);

		assert.strictEqual(container.deltaManager.lastSequenceNumber, 7);
		assert.deepStrictEqual(fetchRanges, []);
		assert.strictEqual(getDeltaStreamConnectionCount(), 1);
		assert(isIDeltaManagerFull(container.deltaManager));
		assert.strictEqual(container.deltaManager.inbound.paused, true);
		assert.strictEqual(container.deltaManager.outbound.paused, true);
	});

	it("pauses immediately when the loaded snapshot is already at the target sequence number", async () => {
		const { loaderProps, fetchRanges, getDeltaStreamConnectionCount } = createLoaderProps(7, [
			createMessage(8),
		]);

		const container = await loadContainerPaused(loaderProps, request, 7);

		assert.strictEqual(container.deltaManager.lastSequenceNumber, 7);
		assert.deepStrictEqual(fetchRanges, []);
		assert.strictEqual(getDeltaStreamConnectionCount(), 0);
		assert(isIDeltaManagerFull(container.deltaManager));
		assert.strictEqual(container.deltaManager.inbound.paused, true);
		assert.strictEqual(container.deltaManager.outbound.paused, true);
	});

	it("rejects when the loaded snapshot is newer than the target sequence number", async () => {
		const { loaderProps } = createLoaderProps(8, []);

		await assert.rejects(
			loadContainerPaused(loaderProps, request, 7),
			/Most recent snapshot is newer than the specified sequence number/u,
		);
	});
});

describe("loadContainerToSequenceNumber", () => {
	it("replays forward from a historical snapshot and returns paused at the target sequence number", async () => {
		const { loaderProps, fetchRanges } = createLoaderProps(5, [
			createMessage(6),
			createMessage(7),
			createMessage(8),
		]);
		const loadProps: ILoadContainerToSequenceNumberProps = {
			...loaderProps,
			request,
			loadToSequenceNumber: 7,
		};

		const container = await loadContainerToSequenceNumber(loadProps);

		assert.strictEqual(container.deltaManager.lastSequenceNumber, 7);
		assert.deepStrictEqual(fetchRanges, [{ from: 6, to: 8 }]);
		assert(isIDeltaManagerFull(container.deltaManager));
		assert.strictEqual(container.deltaManager.inbound.paused, true);
		assert.strictEqual(container.deltaManager.outbound.paused, true);
	});

	it("rejects when delta storage does not have enough ops to reach the target sequence number", async () => {
		const { loaderProps, fetchRanges } = createLoaderProps(5, [createMessage(6)]);
		const loadProps: ILoadContainerToSequenceNumberProps = {
			...loaderProps,
			request,
			loadToSequenceNumber: 7,
		};

		await assert.rejects(
			loadContainerToSequenceNumber(loadProps),
			/Requested sequence number is not available/u,
		);
		assert.deepStrictEqual(fetchRanges, [{ from: 6, to: 8 }]);
	});
});
