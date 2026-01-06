/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IDisposable } from "@fluidframework/core-interfaces/internal";
import { assert, Timer } from "@fluidframework/core-utils/internal";
import { FetchSource } from "@fluidframework/driver-definitions/internal";
import {
	createChildMonitoringContext,
	type MonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import {
	getLatestSnapshotInfo,
	type ISerializedStateManagerDocumentStorageService,
	type ISnapshotInfo,
} from "./serializedStateManager.js";

class RefreshPromiseTracker {
	public get hasPromise(): boolean {
		return this.#promise !== undefined;
	}
	public get promise(): Promise<number> | undefined {
		return this.#promise;
	}
	constructor(private readonly catchHandler: (error: Error) => void) {}

	#promise: Promise<number> | undefined;
	setPromise(p: Promise<number>): void {
		if (this.hasPromise) {
			throw new Error(
				"Cannot start new snapshot refresh while a refresh is already in progress",
			);
		}
		this.#promise = p.finally(() => {
			this.#promise = undefined;
		});
		p.catch(this.catchHandler);
	}
}

/**
 * Manages periodic refresh of the latest snapshot for a document.
 *
 * `SnapshotRefresher` polls the storage service for the most recent snapshot and, when a newer
 * snapshot is discovered, invokes the provided `onSnapshotRefreshed` callback with the updated
 * snapshot metadata. It is responsible for:
 *
 * - Tracking the most recent snapshot that has been observed.
 * - Scheduling and managing refresh attempts via an internal timer.
 * - Emitting telemetry for successful and failed refresh attempts.
 *
 * The refresh behavior can be configured via constructor arguments, including whether offline
 * loading and the `getSnapshot` API are supported, as well as the refresh timeout. Callers
 * should dispose this instance when snapshot refresh is no longer needed to stop any pending
 * timers and prevent further refresh attempts.
 */
export class SnapshotRefresher implements IDisposable {
	private readonly mc: MonitoringContext;
	private latestSnapshot: ISnapshotInfo | undefined;
	#disposed: boolean = false;

	public get disposed(): boolean {
		return this.#disposed;
	}

	private readonly refreshTracker = new RefreshPromiseTracker(
		// eslint-disable-next-line unicorn/consistent-function-scoping
		(error) =>
			this.mc.logger.sendErrorEvent(
				{
					eventName: "RefreshLatestSnapshotFailed",
				},
				error,
			),
	);
	private readonly refreshTimer: Timer | undefined;
	private readonly snapshotRefreshTimeoutMs: number = 60 * 60 * 24 * 1000;
	readonly #snapshotRefreshEnabled: boolean;

	constructor(
		subLogger: ITelemetryBaseLogger,
		private readonly storageAdapter: ISerializedStateManagerDocumentStorageService,
		private readonly offlineLoadEnabled: boolean,
		private readonly supportGetSnapshotApi: () => boolean,
		private readonly onSnapshotRefreshed: (snapshot: ISnapshotInfo) => number,
		snapshotRefreshTimeoutMs?: number,
	) {
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "serializedStateManager",
		});

		this.snapshotRefreshTimeoutMs = snapshotRefreshTimeoutMs ?? this.snapshotRefreshTimeoutMs;

		this.#snapshotRefreshEnabled =
			this.offlineLoadEnabled &&
			(this.mc.config.getBoolean("Fluid.Container.enableOfflineSnapshotRefresh") ??
				this.mc.config.getBoolean("Fluid.Container.enableOfflineFull")) === true;

		this.refreshTimer = this.#snapshotRefreshEnabled
			? new Timer(this.snapshotRefreshTimeoutMs, () => this.tryRefreshSnapshot())
			: undefined;
	}

	public tryRefreshSnapshot(): void {
		if (
			this.#snapshotRefreshEnabled &&
			!this.#disposed &&
			!this.refreshTracker.hasPromise &&
			this.latestSnapshot === undefined
		) {
			// Don't block on the refresh snapshot call - it is for the next time we serialize, not booting this incarnation
			this.refreshTracker.setPromise(this.refreshLatestSnapshot(this.supportGetSnapshotApi()));
		}
	}

	/**
	 * Fetch the latest snapshot for the container, including delay-loaded groupIds if pendingLocalState was provided and contained any groupIds.
	 * Note that this will update the StorageAdapter's cached snapshots for the groupIds (if present)
	 *
	 * @param supportGetSnapshotApi - a boolean indicating whether to use the fetchISnapshot or fetchISnapshotTree (must be true to fetch by groupIds)
	 */
	private async refreshLatestSnapshot(supportGetSnapshotApi: boolean): Promise<number> {
		this.latestSnapshot = await getLatestSnapshotInfo(
			this.mc,
			this.storageAdapter,
			supportGetSnapshotApi,
		);

		if (this.#disposed) {
			return -1;
		}

		// These are loading groupIds that the containerRuntime has requested over its lifetime.
		// We will fetch the latest snapshot for the groupIds, which will update storageAdapter.loadedGroupIdSnapshots's cache
		const downloadedGroupIds = Object.keys(this.storageAdapter.loadedGroupIdSnapshots);
		if (supportGetSnapshotApi && downloadedGroupIds.length > 0) {
			assert(
				this.storageAdapter.getSnapshot !== undefined,
				0x972 /* getSnapshot should exist */,
			);
			// (This is a separate network call from above because it requires work for storage to add a special base groupId)
			const snapshot = await this.storageAdapter.getSnapshot({
				versionId: undefined,
				scenarioName: "getLatestSnapshotInfo",
				cacheSnapshot: false,
				loadingGroupIds: downloadedGroupIds,
				fetchSource: FetchSource.noCache,
			});
			assert(snapshot !== undefined, 0x973 /* Snapshot should exist */);
		}

		// Notify the manager about the fetched snapshot - let it decide what to do with it
		const result =
			this.latestSnapshot === undefined ? -1 : this.onSnapshotRefreshed(this.latestSnapshot);

		this.refreshTimer?.restart();
		return result;
	}

	/**
	 * Clears the latest snapshot after it's been consumed by the manager.
	 * This allows the next refresh cycle to proceed.
	 */
	public clearLatestSnapshot(): void {
		this.latestSnapshot = undefined;
	}

	/**
	 * Starts the refresh timer.
	 */
	public startTimer(): void {
		this.refreshTimer?.start();
	}

	/**
	 * Restarts the refresh timer.
	 */
	public restartTimer(): void {
		this.refreshTimer?.restart();
	}

	/**
	 * Gets the current refresh promise for testing purposes.
	 * @returns The snapshot sequence number promise, or undefined if no refresh is in progress
	 */
	public get refreshSnapshotP(): Promise<number> | undefined {
		return this.refreshTracker.promise;
	}

	/**
	 * Disposes the refresher and clears the timer.
	 */
	public dispose(): void {
		this.#disposed = true;
		this.refreshTimer?.clear();
	}
}
