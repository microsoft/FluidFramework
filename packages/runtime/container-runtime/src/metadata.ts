/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Batching makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
export interface IBatchMetadata {
	batch?: boolean;
}

/**
 * ID makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
export interface IIdMetadata {
	id?: string;
}

/**
 * Blob handling makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
export interface IBlobMetadata {
	blobId?: string;
	localId?: string;
}
