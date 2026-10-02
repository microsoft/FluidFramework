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
	type DecodeErrorHandler,
	type IDecoder,
	type IEncoder,
	type IJsonCodec,
	type JsonValidator,
	makeCodecFamily,
	type SchemaValidationFunction,
	throwDecodeError,
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
	type JsonCodecPart,
} from "./codec.js";
export {
	DiscriminatedUnionDispatcher,
	type DiscriminatedUnionLibrary,
	unionOptions,
} from "./discriminatedUnions.js";
export {
	Versioned,
	makeDiscontinuedCodecAndSchema,
	makeExperimentalCodecVersion,
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
	versionField,
} from "./versioned/index.js";
