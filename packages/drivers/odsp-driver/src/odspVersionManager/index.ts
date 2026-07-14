/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	OdspVersionManager,
	type BaseForSeq,
	type IOdspVersionManager,
	type OdspFileVersionRef,
	type IOdspFileVersionFetcher,
	type ResolvedVersion,
} from "./odspVersionManager.js";
export {
	createOdspFileVersionFetcher,
	type OdspFileVersionFetcherProps,
} from "./odspFileVersionFetcher.js";
