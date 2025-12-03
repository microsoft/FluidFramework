/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	IdCreationRange,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
} from "./persisted-types/index.js";

export type { IIdCompressorCore, IIdCompressor } from "./idCompressor.js";

export type {
	SessionSpaceCompressedId,
	OpSpaceCompressedId,
	SessionId,
	StableId,
} from "./identifiers.js";
