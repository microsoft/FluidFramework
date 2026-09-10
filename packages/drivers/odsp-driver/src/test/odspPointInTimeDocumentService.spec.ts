/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { strict as assert } from "node:assert";

import {
	FetchSource,
	type IClient,
	type IDocumentDeltaStorageService,
	type IDocumentService,
	type IDocumentStorageService,
	type IResolvedUrl,
	type ISequencedDocumentMessage,
	type ISnapshot,
	type ISnapshotFetchOptions,
	type IStream,
	type IStreamResult,
	type IVersion,
} from "@fluidframework/driver-definitions/internal";

// eslint-disable-next-line import-x/no-internal-modules
import { OdspPointInTimeDocumentService } from "../pointInTimeDriver/odspPointInTimeDocumentService.js";

/** Minimal sequenced message: only the sequence number matters to the wrapper's logic. */
const msg = (sequenceNumber: number): ISequencedDocumentMessage =>
	({ sequenceNumber }) as unknown as ISequencedDocumentMessage;

/**
 * A scripted inner delta-storage stream: yields each batch (as a `{done:false}` read) in order, then
 * a single terminal `{done:true}` read. Empty `batches` means the stream serves no ops at all.
 */
function streamFromBatches(batches: number[][]): IStream<ISequencedDocumentMessage[]> {
	let index = 0;
	return {
		read: async (): Promise<IStreamResult<ISequencedDocumentMessage[]>> => {
			if (index < batches.length) {
				return { done: false, value: batches[index++].map(msg) };
			}
			return { done: true };
		},
	};
}

/** Records the (from, to, cachedOnly) each `fetchMessages` was called with, for bounding assertions. */
interface FetchCall {
	readonly from: number;
	readonly to: number | undefined;
	readonly cachedOnly: boolean | undefined;
}

function fakeDeltaStorage(inner: IStream<ISequencedDocumentMessage[]>): {
	service: IDocumentDeltaStorageService;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	const service: IDocumentDeltaStorageService = {
		fetchMessages: (from, to, _abortSignal, cachedOnly) => {
			calls.push({ from, to, cachedOnly });
			return inner;
		},
	};
	return { service, calls };
}

/** Fake live document service that hands back a scripted delta storage and tracks its lifecycle. */
class FakeLiveDocumentService {
	public disposeCount = 0;
	private readonly metadataHandlers = new Set<(metadata: Record<string, string>) => void>();

	public constructor(private readonly deltaStorage: IDocumentDeltaStorageService) {}

	public get metadataHandlerCount(): number {
		return this.metadataHandlers.size;
	}

	public on(event: string, listener: (metadata: Record<string, string>) => void): this {
		if (event === "metadataUpdate") {
			this.metadataHandlers.add(listener);
		}
		return this;
	}

	public off(event: string, listener: (metadata: Record<string, string>) => void): this {
		if (event === "metadataUpdate") {
			this.metadataHandlers.delete(listener);
		}
		return this;
	}

	public emitMetadata(metadata: Record<string, string>): void {
		for (const handler of this.metadataHandlers) {
			handler(metadata);
		}
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		throw new Error("live connectToStorage should not be used by the point-in-time service");
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return this.deltaStorage;
	}

	public dispose(): void {
		this.disposeCount++;
	}
}

/** Fake recoverable (snapshot) document service: only its storage and disposal are exercised. */
class FakeRecoverableDocumentService {
	public disposeCount = 0;
	public connectToStorageCount = 0;
	public snapshotFetchOptions: ISnapshotFetchOptions | undefined;
	public versionsFetchSource: FetchSource | undefined;
	public readonly snapshot = {
		snapshotTree: { blobs: {}, trees: {} },
		blobContents: new Map(),
		ops: [],
		sequenceNumber: 0,
		latestSequenceNumber: 0,
		snapshotFormatV: 1,
	} satisfies ISnapshot;
	public readonly storage = {
		getSnapshot: async (snapshotFetchOptions?: ISnapshotFetchOptions) => {
			this.snapshotFetchOptions = snapshotFetchOptions;
			return this.snapshot;
		},
		getVersions: async (
			_versionId: string | null,
			_count: number,
			_scenarioName?: string,
			fetchSource?: FetchSource,
		): Promise<IVersion[]> => {
			this.versionsFetchSource = fetchSource;
			return [{ id: "version", treeId: undefined! }];
		},
		getSnapshotTree: async () => null,
		createBlob: async () => {
			throw new Error("createBlob should not be used by the point-in-time service");
		},
		readBlob: async () => {
			throw new Error("readBlob should not be used by this test");
		},
		uploadSummaryWithContext: async () => {
			throw new Error(
				"uploadSummaryWithContext should not be used by the point-in-time service",
			);
		},
		downloadSummary: async () => {
			throw new Error("downloadSummary should not be used by the point-in-time service");
		},
	} satisfies IDocumentStorageService;

	public async connectToStorage(): Promise<IDocumentStorageService> {
		this.connectToStorageCount++;
		return this.storage;
	}

	public dispose(): void {
		this.disposeCount++;
	}
}

function makeService(
	target: number,
	inner: IStream<ISequencedDocumentMessage[]>,
): {
	service: OdspPointInTimeDocumentService;
	calls: FetchCall[];
	live: FakeLiveDocumentService;
	recoverable: FakeRecoverableDocumentService;
} {
	const { service: deltaStorage, calls } = fakeDeltaStorage(inner);
	const live = new FakeLiveDocumentService(deltaStorage);
	const recoverable = new FakeRecoverableDocumentService();
	const service = new OdspPointInTimeDocumentService(
		{} as IResolvedUrl,
		recoverable as unknown as IDocumentService,
		live as unknown as IDocumentService,
		target,
	);
	return { service, calls, live, recoverable };
}

/** Read a stream to completion, returning the sequence numbers observed across all batches. */
async function drain(stream: IStream<ISequencedDocumentMessage[]>): Promise<number[]> {
	const seen: number[] = [];
	let result = await stream.read();
	while (!result.done) {
		seen.push(...result.value.map((m) => m.sequenceNumber));
		result = await stream.read();
	}
	return seen;
}

describe("OdspPointInTimeDocumentService", () => {
	describe("connectToDeltaStorage: bounds the fetch so no op past the target is read", () => {
		it("caps an unbounded `to` at target + 1", async () => {
			const { service, calls } = makeService(100, streamFromBatches([]));
			const deltaStorage = await service.connectToDeltaStorage();
			deltaStorage.fetchMessages(10, undefined);
			assert.deepEqual(calls[0], { from: 10, to: 101, cachedOnly: undefined });
		});

		it("caps a `to` that is past the target at target + 1", async () => {
			const { service, calls } = makeService(100, streamFromBatches([]));
			const deltaStorage = await service.connectToDeltaStorage();
			deltaStorage.fetchMessages(10, 500);
			assert.equal(calls[0].to, 101);
		});

		it("leaves a `to` that is before the target unchanged", async () => {
			const { service, calls } = makeService(100, streamFromBatches([]));
			const deltaStorage = await service.connectToDeltaStorage();
			deltaStorage.fetchMessages(10, 50);
			assert.equal(calls[0].to, 50);
		});
	});

	describe("connectToDeltaStorage: passes the served ops through", () => {
		const readAll = async (
			target: number,
			from: number,
			batches: number[][],
		): Promise<number[]> => {
			const { service } = makeService(target, streamFromBatches(batches));
			const deltaStorage = await service.connectToDeltaStorage();
			return drain(deltaStorage.fetchMessages(from, undefined));
		};

		it("yields the ops of a single batch", async () => {
			assert.deepEqual(await readAll(12, 10, [[10, 11, 12]]), [10, 11, 12]);
		});

		it("yields the ops of multiple batches in order", async () => {
			assert.deepEqual(await readAll(12, 10, [[10], [11], [12]]), [10, 11, 12]);
		});

		it("yields nothing when the stream serves no ops", async () => {
			assert.deepEqual(await readAll(12, 10, []), []);
		});
	});

	describe("storage, stream, and lifecycle", () => {
		it("advertises the storageOnly policy", () => {
			const { service } = makeService(100, streamFromBatches([]));
			assert.equal(service.policies?.storageOnly, true);
		});

		it("serves the recoverable snapshot without consulting snapshot caches", async () => {
			const { service, recoverable } = makeService(100, streamFromBatches([]));
			const storage = await service.connectToStorage();
			const snapshot = await storage.getSnapshot?.({ scenarioName: "point-in-time-test" });
			assert.equal(snapshot, recoverable.snapshot);
			assert.deepEqual(recoverable.snapshotFetchOptions, {
				scenarioName: "point-in-time-test",
				fetchSource: FetchSource.noCache,
			});
			assert.equal(recoverable.connectToStorageCount, 1);
		});

		it("bypasses caches when the loader uses the getVersions snapshot path", async () => {
			const { service, recoverable } = makeService(100, streamFromBatches([]));
			const storage = await service.connectToStorage();
			await storage.getVersions(null, 1, "point-in-time-test");
			assert.equal(recoverable.versionsFetchSource, FetchSource.noCache);
		});

		it("refuses connectToDeltaStream (the service is storage-only)", async () => {
			const { service } = makeService(100, streamFromBatches([]));
			await assert.rejects(service.connectToDeltaStream({} as IClient), /storage-only/);
		});

		it("forwards metadataUpdate events from the live document service", () => {
			const { service, live } = makeService(100, streamFromBatches([]));
			const received: Record<string, string>[] = [];
			service.on("metadataUpdate", (metadata) => received.push(metadata));
			live.emitMetadata({ epoch: "abc" });
			assert.deepEqual(received, [{ epoch: "abc" }]);
		});

		it("disposes both inner services and detaches the metadata listener on dispose", () => {
			const { service, live, recoverable } = makeService(100, streamFromBatches([]));
			assert.equal(live.metadataHandlerCount, 1, "listener attached in constructor");
			service.dispose();
			assert.equal(recoverable.disposeCount, 1);
			assert.equal(live.disposeCount, 1);
			assert.equal(live.metadataHandlerCount, 0, "listener detached on dispose");
		});
	});
});
