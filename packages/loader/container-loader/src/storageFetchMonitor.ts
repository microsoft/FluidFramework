/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDisposable, IEventProvider } from "@fluidframework/core-interfaces";

import type { IDeltaManagerInternalEvents } from "./deltaManager.js";

type StorageFetchCompleteListener = () => void;

/**
 * Monitors DeltaManager for storage fetch completion.
 * Used to delay Connected state until we know the true latest sequence number.
 *
 * This monitor is only created when a storage fetch is actually pending
 * (i.e., `isConnectionFetchPending` is true). If no fetch is pending,
 * the caller should skip creating a monitor entirely.
 */
export class StorageFetchMonitor implements IDisposable {
	private fetchComplete: boolean = false;
	private _disposed: boolean = false;

	private readonly fetchCompleteHandler = (): void => {
		if (!this.fetchComplete) {
			this.fetchComplete = true;
			this.listener();
		}
	};

	constructor(
		private readonly deltaManager: IEventProvider<IDeltaManagerInternalEvents>,
		private readonly listener: StorageFetchCompleteListener,
	) {
		this.deltaManager.on("storageFetchComplete", this.fetchCompleteHandler);
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.dispose}
	 */
	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this.deltaManager.off("storageFetchComplete", this.fetchCompleteHandler);
	}
}
