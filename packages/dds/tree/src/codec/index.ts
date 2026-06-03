/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type CodecName,
	type CodecTree,
	type CodecWriteOptions,
	type CodecWriteOptionsBeta,
	currentVersion,
	DependentFormatVersion,
	eraseEncodedType,
	extractJsonValidator,
	FluidClientVersion,
	type FormatValidator,
	FormatValidatorNoOp,
	type FormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IDecoder,
	type IEncoder,
	type IJsonCodec,
	type JsonCodecPart,
	type JsonValidator,
	jsonableCodecTree,
	makeCodecFamily,
	type SchemaValidationFunction,
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
	type CodecAndSchema,
	type CodecVersion,
	makeDiscontinuedCodecAndSchema,
	type VersionDispatchingCodec,
	VersionDispatchingCodecBuilder,
	Versioned,
	versionField,
} from "./versioned/index.js";
