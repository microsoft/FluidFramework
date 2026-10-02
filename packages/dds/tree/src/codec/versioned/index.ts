/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { Versioned, versionField } from "./format.js";
export {
	VersionDispatchingCodecBuilder,
	type VersionDispatchingCodec,
	type VersionDispatchingCodecBuilderOptions,
	type CodecVersion,
	type CodecVersionStable,
	type CodecVersionDiscontinued,
	type CodecVersionExperimental,
	type CodecVersionReadonly,
	type CodecAndSchema,
	type CodecAndSchemaReadonly,
} from "./codec.js";
