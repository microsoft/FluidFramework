/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { Versioned, versionField } from "./format.js";
export {
	makeDiscontinuedCodecAndSchema,
	VersionDispatchingCodecBuilder,
	type VersionDispatchingCodec,
	type CodecVersion,
	type CodecAndSchema,
} from "./codec.js";
