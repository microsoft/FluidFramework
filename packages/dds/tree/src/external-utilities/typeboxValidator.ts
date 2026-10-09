/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static, TSchema } from "typebox";
import { Build, type EvaluateResult } from "typebox/schema";

import { toFormatValidator, type JsonValidator } from "../codec/index.js";
import { getOrCreate } from "../util/index.js";

/**
 * A {@link JsonValidator} implementation which uses TypeBox's JSON schema validator.
 *
 * @privateRemarks Take care to not reference this validator directly in SharedTree code:
 * the intent of factoring JSON validation into an interface is to make validation more pay-to-play
 * (i.e. a JSON validator is only included in an application's bundle if that application references it).
 *
 * Defining this validator in its own file also helps to ensure it is tree-shakeable.
 */
const typeboxValidator: JsonValidator = {
	compile: <Schema extends TSchema>(schema: Schema) => {
		// Retrieve the compiled format from the cache, or build and evaluate it if not present.
		const compiledFormat = getOrCreate(cache, schema, (key) => Build(key).Evaluate());
		return {
			check: (data): data is Static<Schema> => compiledFormat.Check(data),
		};
	},
};

/**
 * A cache for compiled TypeBox schemas.
 * @remarks
 * Ideally this should be unnecessary, as our code does a decent job of passing around and reusing the compiled schemas and most production scenarios don't actually compile schemas at all,
 * but this cache is cheap, and it helps significant in some cases, especially tests which compile many schemas as part of short lived trees.
 */
const cache = new WeakMap<TSchema, EvaluateResult>();

/**
 * A {@link FormatValidator} implementation which uses TypeBox's JSON schema validator.
 * @alpha
 */
export const FormatValidatorBasic = toFormatValidator(typeboxValidator);
