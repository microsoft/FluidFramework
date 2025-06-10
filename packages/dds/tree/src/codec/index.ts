/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FormatVersion,
	type IBinaryCodec,
	type ICodecFamily,
	type ICodecOptions,
	type CodecWriteOptions,
	type IDecoder,
	type IEncoder,
	type IJsonCodec,
	type IMultiFormatCodec,
	type JsonValidator,
	makeCodecFamily,
	type SchemaValidationFunction,
	unitCodec,
	withDefaultBinaryEncoding,
	withSchemaValidation,
	FluidClientVersion,
	currentVersion,
	type CodecName,
} from "./codec.js";
export {
	DiscriminatedUnionDispatcher,
	type DiscriminatedUnionLibrary,
	unionOptions,
} from "./discriminatedUnions.js";
export { noopValidator } from "./noopValidator.js";
export {
	Versioned,
	makeVersionedCodec,
	makeVersionedValidatedCodec,
	makeVersionDispatchingCodec,
	ClientVersionDispatchingCodecBuilder,
	type CodecVersion,
} from "./versioned/index.js";
