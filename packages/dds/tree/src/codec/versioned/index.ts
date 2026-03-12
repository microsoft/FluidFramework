/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	ClientVersionDispatchingCodecBuilder,
	type CodecAndSchema,
	type CodecVersion,
	makeDiscontinuedCodecVersion,
	makeVersionDispatchingCodec,
	makeVersionedValidatedCodec,
} from "./codec.js";
export { Versioned, versionField } from "./format.js";
