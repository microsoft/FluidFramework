/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export {
	IBinaryCodec,
	ICodecFamily,
	ICodecOptions,
	IDecoder,
	IEncoder,
	IJsonCodec,
	IMultiFormatCodec,
	JsonValidator,
	makeCodecFamily,
	SchemaValidationFunction,
	SessionAwareCodec,
	unitCodec,
	withDefaultBinaryEncoding,
	withSchemaValidation,
} from "./codec";
export { DiscriminatedUnionDispatcher, unionOptions } from "./discriminatedUnions";
export { noopValidator } from "./noopValidator";
export { Versioned, makeVersionedCodec, makeVersionedValidatedCodec } from "./versioned";
