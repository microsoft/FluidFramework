/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { Versioned } from "./format.js";
export {
	makeVersionedCodec,
	makeVersionedValidatedCodec,
	makeVersionDispatchingCodec,
	ClientVersionDispatchingCodecBuilder,
	type CodecVersion,
} from "./codec.js";
