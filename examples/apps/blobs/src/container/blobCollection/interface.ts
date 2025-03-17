/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

/**
 * IBlobCollectionEvents describes the events for an IBlobCollection.
 */
export interface IBlobCollectionEvents extends IEvent {
	(event: "blobsChanged", listener: () => void);
}

export interface IBlobRecord {
	readonly id: string;
	readonly blob: Blob;
}

/**
 * IBlobCollection describes the public API surface for our blob collection data object.
 */
export interface IBlobCollection {
	/**
	 * Object that events for changes in the blob map.
	 */
	readonly events: IEventProvider<IBlobCollectionEvents>;

	/**
	 * Get all the blobs in the map.
	 */
	readonly getBlobs: () => IBlobRecord[];

	/**
	 * Add a blob to the map.
	 */
	readonly addBlob: (blob: Blob) => void;
}
