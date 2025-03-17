/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

/**
 * IBlobMapEvents describes the events for an IBlobMap.
 */
export interface IBlobMapEvents extends IEvent {
	(event: "blobsChanged", listener: () => void);
}

export interface IBlobRecord {
	readonly id: string;
	readonly blob: Blob;
}

/**
 * IBlobMap describes the public API surface for our blob map data object.
 */
export interface IBlobMap {
	/**
	 * Object that events for changes in the blob map.
	 */
	readonly events: IEventProvider<IBlobMapEvents>;

	/**
	 * Get all the blobs in the map.
	 */
	readonly getBlobs: () => IBlobRecord[];

	readonly addBlob: (blob: Blob) => void;
}
