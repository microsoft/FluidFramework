/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import type {
	FetchSource,
	ISnapshot,
	ISnapshotFetchOptions,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger, mixinMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import type {
	ISerializedStateManagerDocumentStorageService,
	ISnapshotInfo,
} from "../serializedStateManager.js";
import { SnapshotRefresher } from "../snapshotRefresher.js";

const snapshotTree: ISnapshotTree = {
	id: "snapshot-1",
	blobs: {},
	trees: {
		".protocol": {
			blobs: { attributes: "attributesId-0" },
			trees: {},
		},
		".app": {
			blobs: {},
			trees: {},
		},
	},
};

const initialSnapshot: ISnapshot = {
	blobContents: new Map([
		[
			"attributesId-0",
			stringToBuffer('{"minimumSequenceNumber" : 0, "sequenceNumber": 0}', "utf8"),
		],
	]),
	latestSequenceNumber: undefined,
	ops: [],
	sequenceNumber: 0,
	snapshotTree,
	snapshotFormatV: 1,
};

function enableOfflineSnapshotRefresh(logger: ITelemetryBaseLogger): ITelemetryBaseLogger {
	return mixinMonitoringContext(logger, {
		getRawConfig: (name) =>
			name === "Fluid.Container.enableOfflineSnapshotRefresh" ? true : undefined,
	}).logger;
}

class MockStorageAdapter implements ISerializedStateManagerDocumentStorageService {
	public readonly blobs = new Map<string, ArrayBuffer>();
	private snapshot: ISnapshotTree;
	private snapshotSequenceNumber: number = 0;
	public getSnapshotCallCount = 0;
	public getVersionsCallCount = 0;
	public getSnapshotTreeCallCount = 0;
	public shouldFailGetVersions = false;
	public shouldFailGetSnapshot = false;
	private readonly getVersionsDeferred = new Deferred<IVersion[]>();
	private readonly getSnapshotDeferred = new Deferred<ISnapshot>();

	constructor(snapshot: ISnapshotTree = snapshotTree, sequenceNumber: number = 0) {
		this.snapshot = snapshot;
		this.snapshotSequenceNumber = sequenceNumber;
		this.blobs.set(
			"attributesId-0",
			stringToBuffer(
				`{"minimumSequenceNumber" : 0, "sequenceNumber": ${sequenceNumber}}`,
				"utf8",
			),
		);
	}

	public cacheSnapshotBlobs(snapshotBlobs: Map<string, ArrayBuffer>): void {
		for (const [key, value] of snapshotBlobs.entries()) {
			this.blobs.set(key, value);
		}
	}

	public get loadedGroupIdSnapshots(): Record<string, ISnapshot> {
		return {};
	}

	public async getSnapshot(
		_snapshotFetchOptions?: ISnapshotFetchOptions | undefined,
	): Promise<ISnapshot> {
		this.getSnapshotCallCount++;
		if (this.shouldFailGetSnapshot) {
			throw new Error("getSnapshot failed");
		}
		return this.getSnapshotDeferred.promise;
	}

	public async getSnapshotTree(
		_version?: IVersion | undefined,
		_scenarioName?: string | undefined,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		this.getSnapshotTreeCallCount++;
		return this.snapshot;
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		_versionId: string | null,
		_count: number,
		_scenarioName?: string | undefined,
		_fetchSource?: FetchSource | undefined,
	): Promise<IVersion[]> {
		this.getVersionsCallCount++;
		if (this.shouldFailGetVersions) {
			throw new Error("getVersions failed");
		}
		return this.getVersionsDeferred.promise;
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		if (!this.blobs.has(id)) {
			throw new Error(`Requested blob does not exist: ${id}`);
		}
		return this.blobs.get(id) as ArrayBufferLike;
	}

	public uploadSummary(sequenceNumber: number): void {
		const attributesId = `attributesId-${sequenceNumber}`;
		this.snapshot = structuredClone(this.snapshot);
		this.snapshot.id = `snapshot-${sequenceNumber}`;
		this.snapshot.trees[".protocol"].blobs.attributes = attributesId;
		this.snapshotSequenceNumber = sequenceNumber;
		this.blobs.set(
			attributesId,
			stringToBuffer(
				`{"minimumSequenceNumber" : 0, "sequenceNumber": ${sequenceNumber}}`,
				"utf8",
			),
		);
	}

	public resolveGetVersions(): void {
		assert(this.snapshot.id !== undefined, "snapshot.id should be defined");
		this.getVersionsDeferred.resolve([{ id: this.snapshot.id, treeId: this.snapshot.id }]);
	}

	public resolveGetSnapshot(): void {
		const snapshot: ISnapshot = {
			blobContents: this.blobs,
			latestSequenceNumber: undefined,
			ops: [],
			sequenceNumber: this.snapshotSequenceNumber,
			snapshotTree: this.snapshot,
			snapshotFormatV: 1,
		};
		this.getSnapshotDeferred.resolve(snapshot);
	}
}

describe("SnapshotRefresher", () => {
	let clock: SinonFakeTimers;
	let mockLogger: MockLogger;
	let mockStorage: MockStorageAdapter;
	let refreshCallbackInvoked: boolean;
	let lastRefreshedSnapshot: ISnapshotInfo | undefined;
	const defaultRefreshTimeoutMs = 24 * 60 * 60 * 1000; // 24 hours

	function createRefresher(
		offlineLoadEnabled: boolean = true,
		supportGetSnapshotApi: () => boolean = () => true,
		snapshotRefreshTimeoutMs?: number,
		logger: ITelemetryBaseLogger = mockLogger,
	): SnapshotRefresher {
		return new SnapshotRefresher(
			logger,
			mockStorage,
			offlineLoadEnabled,
			supportGetSnapshotApi,
			(snapshot: ISnapshotInfo): number => {
				refreshCallbackInvoked = true;
				lastRefreshedSnapshot = snapshot;
				return snapshot.snapshotSequenceNumber;
			},
			snapshotRefreshTimeoutMs,
		);
	}

	beforeEach(() => {
		clock = useFakeTimers();
		mockLogger = new MockLogger();
		mockStorage = new MockStorageAdapter();
		refreshCallbackInvoked = false;
		lastRefreshedSnapshot = undefined;
	});

	afterEach(() => {
		clock.restore();
	});

	describe("Constructor and Initialization", () => {
		it("should create refresher with offline load enabled", () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);
			assert.strictEqual(refresher.disposed, false, "Refresher should not be disposed");
			refresher.dispose();
		});

		it("should create refresher with offline load disabled", () => {
			const refresher = createRefresher(false);
			assert.strictEqual(refresher.disposed, false, "Refresher should not be disposed");
			refresher.dispose();
		});

		it("should use custom timeout when provided", () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const customTimeout = 5000;
			const refresher = createRefresher(true, () => true, customTimeout, logger);
			refresher.startTimer();

			// Verify timer doesn't fire before custom timeout
			clock.tick(customTimeout - 1);
			assert.strictEqual(
				refreshCallbackInvoked,
				false,
				"Callback should not be invoked before timeout",
			);

			refresher.dispose();
		});

		it("should use default timeout when not provided", () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);
			refresher.startTimer();

			// Verify timer doesn't fire before default timeout
			clock.tick(defaultRefreshTimeoutMs - 1);
			assert.strictEqual(
				refreshCallbackInvoked,
				false,
				"Callback should not be invoked before timeout",
			);

			refresher.dispose();
		});
	});

	describe("Timer Management", () => {
		it("should start timer when startTimer is called", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const timeout = 1000;
			const refresher = createRefresher(true, () => true, timeout, logger);

			refresher.startTimer();

			// Fast forward past timeout
			clock.tick(timeout);

			// Should trigger refresh
			assert.strictEqual(mockStorage.getVersionsCallCount, 1, "getVersions should be called");

			refresher.dispose();
		});

		it("should restart timer when restartTimer is called", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const timeout = 1000;
			const refresher = createRefresher(true, () => true, timeout, logger);

			refresher.startTimer();
			clock.tick(500); // Halfway through

			refresher.restartTimer();
			clock.tick(500); // Another 500ms (total 1000ms, but timer was restarted)

			// Should not have triggered yet
			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				0,
				"getVersions should not be called yet",
			);

			clock.tick(500); // Now we reach the restarted timeout

			// Should trigger refresh
			assert.strictEqual(mockStorage.getVersionsCallCount, 1, "getVersions should be called");

			refresher.dispose();
		});

		it("should not trigger refresh when offline load is disabled", () => {
			const timeout = 1000;
			const refresher = createRefresher(false, () => true, timeout);

			refresher.startTimer();
			clock.tick(timeout);

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				0,
				"getVersions should not be called when offline load is disabled",
			);

			refresher.dispose();
		});

		it("should not trigger refresh when snapshot refresh is not enabled", () => {
			const timeout = 1000;
			const refresher = createRefresher(true, () => true, timeout); // No config enabled

			refresher.startTimer();
			clock.tick(timeout);

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				0,
				"getVersions should not be called when snapshot refresh is not enabled",
			);

			refresher.dispose();
		});
	});

	describe("tryRefreshSnapshot", () => {
		it("should trigger refresh manually", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			refresher.tryRefreshSnapshot();

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				1,
				"getVersions should be called once",
			);

			refresher.dispose();
		});

		it("should not trigger refresh if already in progress", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			refresher.tryRefreshSnapshot();
			refresher.tryRefreshSnapshot(); // Try again while first is in progress

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				1,
				"getVersions should be called only once",
			);

			refresher.dispose();
		});

		it("should not trigger refresh if disposed", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			refresher.dispose();
			refresher.tryRefreshSnapshot();

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				0,
				"getVersions should not be called after disposal",
			);
		});

		it("should trigger refresh again after previous completes", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			// First refresh
			refresher.tryRefreshSnapshot();
			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			await refresher.refreshSnapshotP;

			// Clear and try again
			refresher.clearLatestSnapshot();
			refresher.tryRefreshSnapshot();

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				2,
				"getVersions should be called twice",
			);

			refresher.dispose();
		});
	});

	describe("Snapshot Refresh Flow", () => {
		it("should fetch snapshot using getSnapshot API when supported", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			mockStorage.uploadSummary(10);

			refresher.tryRefreshSnapshot();
			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			await refresher.refreshSnapshotP;

			assert.strictEqual(mockStorage.getSnapshotCallCount, 1, "getSnapshot should be called");
			assert.strictEqual(
				mockStorage.getSnapshotTreeCallCount,
				0,
				"getSnapshotTree should not be called",
			);
			assert.strictEqual(refreshCallbackInvoked, true, "Refresh callback should be invoked");
			assert.strictEqual(
				lastRefreshedSnapshot?.snapshotSequenceNumber,
				10,
				"Snapshot sequence number should be 10",
			);

			refresher.dispose();
		});

		it("should fetch snapshot using getSnapshotTree API when getSnapshot not supported", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => false, undefined, logger);

			mockStorage.uploadSummary(10);

			refresher.tryRefreshSnapshot();
			mockStorage.resolveGetVersions();

			await refresher.refreshSnapshotP;

			assert.strictEqual(
				mockStorage.getSnapshotCallCount,
				0,
				"getSnapshot should not be called",
			);
			assert.strictEqual(
				mockStorage.getSnapshotTreeCallCount,
				1,
				"getSnapshotTree should be called",
			);
			assert.strictEqual(refreshCallbackInvoked, true, "Refresh callback should be invoked");
			assert.strictEqual(
				lastRefreshedSnapshot?.snapshotSequenceNumber,
				10,
				"Snapshot sequence number should be 10",
			);

			refresher.dispose();
		});

		it("should handle refresh error and log telemetry", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			mockStorage.shouldFailGetVersions = true;

			refresher.tryRefreshSnapshot();

			// The promise will reject, but the error handler will catch it internally
			// We just need to wait for the promise to settle
			const promise = refresher.refreshSnapshotP;
			assert(promise !== undefined, "Promise should exist");

			// Wait a bit for the error to propagate through the error handler
			await Promise.race([promise, new Promise((resolve) => setTimeout(resolve, 100))]);
			clock.tick(100);

			// The error is logged as a cancel event by PerformanceEvent.timedExecAsync
			mockLogger.assertMatchAny([
				{
					eventName: "serializedStateManager:GetLatestSnapshotInfo_cancel",
					error: "getVersions failed",
				},
			]);

			refresher.dispose();
		});

		it("should restart timer after successful refresh", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const timeout = 1000;
			const refresher = createRefresher(true, () => true, timeout, logger);

			mockStorage.uploadSummary(10);

			refresher.tryRefreshSnapshot();
			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			await refresher.refreshSnapshotP;

			assert.strictEqual(refreshCallbackInvoked, true, "Refresh callback should be invoked");

			// Clear and upload new snapshot for next refresh
			refreshCallbackInvoked = false;
			refresher.clearLatestSnapshot();
			mockStorage.uploadSummary(20);

			// Advance timer to trigger automatic refresh
			clock.tick(timeout);

			// Should trigger another refresh
			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				2,
				"getVersions should be called twice",
			);

			refresher.dispose();
		});

		it("should not invoke callback if disposed during refresh", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			mockStorage.uploadSummary(10);

			refresher.tryRefreshSnapshot();

			// Dispose before resolving
			refresher.dispose();

			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			await refresher.refreshSnapshotP;

			assert.strictEqual(
				refreshCallbackInvoked,
				false,
				"Refresh callback should not be invoked after disposal",
			);
		});

		it("should return -1 from refreshSnapshotP when disposed during refresh", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			mockStorage.uploadSummary(10);

			refresher.tryRefreshSnapshot();

			// Dispose before resolving
			refresher.dispose();

			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			const result = await refresher.refreshSnapshotP;

			assert.strictEqual(result, -1, "Should return -1 when disposed");
		});
	});

	describe("clearLatestSnapshot", () => {
		it("should clear latest snapshot and allow new refresh", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			mockStorage.uploadSummary(10);

			// First refresh
			refresher.tryRefreshSnapshot();
			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			await refresher.refreshSnapshotP;

			assert.strictEqual(refreshCallbackInvoked, true, "Refresh callback should be invoked");

			// Try to refresh again without clearing
			refreshCallbackInvoked = false;
			refresher.tryRefreshSnapshot();

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				1,
				"Should not refresh again with snapshot cached",
			);

			// Now clear and try again
			refresher.clearLatestSnapshot();
			refresher.tryRefreshSnapshot();

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				2,
				"Should refresh after clearing snapshot",
			);

			refresher.dispose();
		});
	});

	describe("Disposal", () => {
		it("should be disposable", () => {
			const refresher = createRefresher();
			assert.strictEqual(refresher.disposed, false, "Should not be disposed initially");

			refresher.dispose();
			assert.strictEqual(refresher.disposed, true, "Should be disposed after calling dispose");
		});

		it("should clear timer on disposal", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const timeout = 1000;
			const refresher = createRefresher(true, () => true, timeout, logger);

			refresher.startTimer();
			refresher.dispose();

			clock.tick(timeout);

			assert.strictEqual(
				mockStorage.getVersionsCallCount,
				0,
				"Timer should not fire after disposal",
			);
		});

		it("should be safe to dispose multiple times", () => {
			const refresher = createRefresher();

			refresher.dispose();
			refresher.dispose();
			refresher.dispose();

			assert.strictEqual(refresher.disposed, true, "Should remain disposed");
		});
	});

	describe("refreshSnapshotP promise for testing", () => {
		it("should return undefined when no refresh is in progress", () => {
			const refresher = createRefresher();

			assert.strictEqual(
				refresher.refreshSnapshotP,
				undefined,
				"Should return undefined when no refresh in progress",
			);

			refresher.dispose();
		});

		it("should return promise when refresh is in progress", () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			refresher.tryRefreshSnapshot();

			assert.notStrictEqual(
				refresher.refreshSnapshotP,
				undefined,
				"Should return promise when refresh in progress",
			);

			refresher.dispose();
		});

		it("should return undefined after refresh completes", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			mockStorage.uploadSummary(10);

			refresher.tryRefreshSnapshot();
			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			await refresher.refreshSnapshotP;

			assert.strictEqual(
				refresher.refreshSnapshotP,
				undefined,
				"Should return undefined after refresh completes",
			);

			refresher.dispose();
		});

		it("should return snapshot sequence number from promise", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const refresher = createRefresher(true, () => true, undefined, logger);

			mockStorage.uploadSummary(42);

			refresher.tryRefreshSnapshot();
			mockStorage.resolveGetVersions();
			mockStorage.resolveGetSnapshot();

			const sequenceNumber = await refresher.refreshSnapshotP;

			assert.strictEqual(sequenceNumber, 42, "Should return snapshot sequence number");

			refresher.dispose();
		});
	});

	describe("Group ID Snapshots", () => {
		it("should fetch group ID snapshots when available and getSnapshot API is supported", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const mockStorageWithGroupIds = new MockStorageAdapter();

			// Add group ID snapshots
			Object.defineProperty(mockStorageWithGroupIds, "loadedGroupIdSnapshots", {
				value: { "group1": initialSnapshot, "group2": initialSnapshot },
				writable: false,
			});

			const refresher = new SnapshotRefresher(
				logger,
				mockStorageWithGroupIds,
				true,
				() => true, // getSnapshot API supported
				(snapshot: ISnapshotInfo): number => {
					refreshCallbackInvoked = true;
					lastRefreshedSnapshot = snapshot;
					return snapshot.snapshotSequenceNumber;
				},
			);

			mockStorageWithGroupIds.uploadSummary(10);

			refresher.tryRefreshSnapshot();
			mockStorageWithGroupIds.resolveGetVersions();
			mockStorageWithGroupIds.resolveGetSnapshot();

			await refresher.refreshSnapshotP;

			// Should call getSnapshot twice: once for main snapshot, once for group IDs
			assert.strictEqual(
				mockStorageWithGroupIds.getSnapshotCallCount,
				2,
				"getSnapshot should be called twice (main + groupIds)",
			);

			refresher.dispose();
		});

		it("should not fetch group ID snapshots when getSnapshot API is not supported", async () => {
			const logger = enableOfflineSnapshotRefresh(mockLogger);
			const mockStorageWithGroupIds = new MockStorageAdapter();

			// Add group ID snapshots
			Object.defineProperty(mockStorageWithGroupIds, "loadedGroupIdSnapshots", {
				value: { "group1": initialSnapshot, "group2": initialSnapshot },
				writable: false,
			});

			const refresher = new SnapshotRefresher(
				logger,
				mockStorageWithGroupIds,
				true,
				() => false, // getSnapshot API not supported
				(snapshot: ISnapshotInfo): number => {
					refreshCallbackInvoked = true;
					lastRefreshedSnapshot = snapshot;
					return snapshot.snapshotSequenceNumber;
				},
			);

			mockStorageWithGroupIds.uploadSummary(10);

			refresher.tryRefreshSnapshot();
			mockStorageWithGroupIds.resolveGetVersions();

			await refresher.refreshSnapshotP;

			// Should not call getSnapshot at all (using getSnapshotTree instead)
			assert.strictEqual(
				mockStorageWithGroupIds.getSnapshotCallCount,
				0,
				"getSnapshot should not be called when API not supported",
			);

			refresher.dispose();
		});
	});
});
