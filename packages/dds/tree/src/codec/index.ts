/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type FormatVersion,
	DependentFormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type CodecWriteOptions,
	type CodecWriteOptionsBeta,
	type IDecoder,
	type IEncoder,
	type IJsonCodec,
	type JsonValidator,
	makeCodecFamily,
	type SchemaValidationFunction,
	unitCodec,
	withSchemaValidation,
	FluidClientVersion,
	currentVersion,
	toFormatValidator,
	FormatValidatorNoOp,
	type FormatValidator,
	type CodecTree,
	jsonableCodecTree,
	extractJsonValidator,
	type CodecName,
	eraseEncodedType,
} from "./codec.js";
export {
	DiscriminatedUnionDispatcher,
	type DiscriminatedUnionLibrary,
	unionOptions,
} from "./discriminatedUnions.js";
export {
	Versioned,
	makeVersionDispatchingCodec,
	makeDiscontinuedCodecVersion,
	ClientVersionDispatchingCodecBuilder,
	type CodecVersion,
	type CodecAndSchema,
	versionField,
} from "./versioned/index.js";
