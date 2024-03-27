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
	unitCodec,
	withDefaultBinaryEncoding,
	withSchemaValidation,
} from "./codec.js";
export { DiscriminatedUnionDispatcher, unionOptions } from "./discriminatedUnions.js";
export { noopValidator } from "./noopValidator.js";
export { Versioned, makeVersionedCodec, makeVersionedValidatedCodec } from "./versioned/index.js";
