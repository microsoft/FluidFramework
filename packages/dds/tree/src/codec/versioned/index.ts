/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type CodecAndSchema,
	type CodecVersion,
	makeDiscontinuedCodecAndSchema,
	type VersionDispatchingCodec,
	VersionDispatchingCodecBuilder,
} from "./codec.js";
export { Versioned, versionField } from "./format.js";
