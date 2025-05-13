/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static, TSchema } from "@sinclair/typebox";
// This export is documented as supported in typebox's documentation.
// eslint-disable-next-line import/no-internal-modules
import { TypeCompiler } from "@sinclair/typebox/compiler";

import type { JsonValidator } from "../codec/index.js";

/**
 * A {@link JsonValidator} implementation which uses TypeBox's JSON schema validator.
 *
 * @privateRemarks Take care to not reference this validator directly in SharedTree code:
 * the intent of factoring JSON validation into an interface is to make validation more pay-to-play
 * (i.e. a JSON validator is only included in an application's bundle if that application references it).
 *
 * Defining this validator in its own file also helps to ensure it is tree-shakeable.
 *
 * @alpha
 */
export const typeboxValidator: JsonValidator = {
	compile: <Schema extends TSchema>(schema: Schema) => {
		const compiledFormat = TypeCompiler.Compile(schema);
		return {
			check: (data): data is Static<Schema> => compiledFormat.Check(data),
		};
	},
};
