/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static, TSchema } from "@sinclair/typebox";
// This export is documented as supported in TypeBox's documentation.
// eslint-disable-next-line import-x/no-internal-modules
import { Check } from "@sinclair/typebox/value";

import { toFormatValidator, type JsonValidator } from "../codec/index.js";

/**
 * A {@link JsonValidator} implementation which uses TypeBox's JSON schema interpreter.
 *
 * @privateRemarks Take care to not reference this validator directly in SharedTree code:
 * the intent of factoring JSON validation into an interface is to make validation more pay-to-play
 * (i.e. a JSON validator is only included in an application's bundle if that application references it).
 *
 * Defining this validator in its own file also helps to ensure it is tree-shakeable.
 */
const typeboxInterpreterValidator: JsonValidator = {
	compile: <Schema extends TSchema>(schema: Schema) => ({
		check: (data): data is Static<Schema> => Check(schema, data),
	}),
};

/**
 * A {@link FormatValidator} implementation which uses TypeBox's JSON schema interpreter.
 *
 * @remarks
 * Unlike {@link FormatValidatorBasic}, this validator does not generate code at runtime,
 * so it can be used in environments with a Content Security Policy that disallows dynamic code generation.
 * Interpreted validation is slower than the compiled validation performed by {@link FormatValidatorBasic}.
 *
 * @alpha
 */
export const FormatValidatorInterpreted = toFormatValidator(typeboxInterpreterValidator);
