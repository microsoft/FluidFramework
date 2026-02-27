/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { Versioned, versionField } from "./format.js";
export {
	makeVersionedValidatedCodec,
	makeVersionDispatchingCodec,
	makeDiscontinuedCodecVersion,
	ClientVersionDispatchingCodecBuilder,
	type CodecVersion,
	type CodecAndSchema,
} from "./codec.js";
