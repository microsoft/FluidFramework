/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type CodecName,
	type CodecTree,
	type CodecWriteOptions,
	type CodecWriteOptionsBeta,
	DependentFormatVersion,
	FluidClientVersion,
	type FormatValidator,
	FormatValidatorNoOp,
	type FormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IDecoder,
	type IEncoder,
	type IJsonCodec,
	type JsonValidator,
	type SchemaValidationFunction,
	currentVersion,
	eraseEncodedType,
	extractJsonValidator,
	jsonableCodecTree,
	makeCodecFamily,
	toFormatValidator,
	unitCodec,
	withSchemaValidation,
} from "./codec.js";
export {
	DiscriminatedUnionDispatcher,
	type DiscriminatedUnionLibrary,
	unionOptions,
} from "./discriminatedUnions.js";
export {
	ClientVersionDispatchingCodecBuilder,
	type CodecAndSchema,
	type CodecVersion,
	Versioned,
	makeDiscontinuedCodecVersion,
	makeVersionDispatchingCodec,
	makeVersionedValidatedCodec,
} from "./versioned/index.js";
