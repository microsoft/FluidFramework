/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type CodecTree,
	type CodecWriteOptions,
	currentVersion,
	DependentFormatVersion,
	extractJsonValidator,
	FluidClientVersion,
	type FormatValidator,
	FormatValidatorNoOp,
	type FormatVersion,
	type IBinaryCodec,
	type ICodecFamily,
	type ICodecOptions,
	type IDecoder,
	type IEncoder,
	type IJsonCodec,
	type IMultiFormatCodec,
	type JsonValidator,
	jsonableCodecTree,
	makeCodecFamily,
	type SchemaValidationFunction,
	toFormatValidator,
	unitCodec,
	withDefaultBinaryEncoding,
	withSchemaValidation,
} from "./codec.js";
export {
	DiscriminatedUnionDispatcher,
	type DiscriminatedUnionLibrary,
	unionOptions,
} from "./discriminatedUnions.js";
export {
	makeDiscontinuedCodecVersion,
	makeVersionDispatchingCodec,
	makeVersionedCodec,
	makeVersionedValidatedCodec,
	Versioned,
} from "./versioned/index.js";
