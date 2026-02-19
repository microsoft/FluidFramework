/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { IIdCompressor, IIdCompressorCore } from "./idCompressor.js";
export type {
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
} from "./identifiers.js";
export type {
	IdCreationRange,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
} from "./persisted-types/index.js";
