/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Optional ODSP point-in-time loading implementation for consumer injection.
 *
 * @packageDocumentation
 */

// eslint-disable-next-line import-x/no-internal-modules -- Dedicated entrypoint for the optional point-in-time implementation.
export { createPointInTimeDocumentService } from "./pointInTimeDriver/createPointInTimeDocumentService.js";
export type {
	IOdspPointInTimeDocumentServiceImplementationProps,
	OdspPointInTimeDocumentServiceImplementation,
} from "./odspDocumentServiceFactoryCore.js";
export type {
	EpochTracker,
	FetchType,
	FetchTypeInternal,
	ICacheAndTracker,
} from "./epochTracker.js";
export type {
	INonPersistentCache,
	IOdspCache,
	IPersistedFileCache,
	IPrefetchSnapshotContents,
} from "./odspCache.js";
export type { IOdspResponse } from "./odspUtils.js";
