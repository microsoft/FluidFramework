/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Based on ESM workaround from https://github.com/ajv-validator/ajv/issues/2047#issuecomment-1241470041 .
// In ESM, this gets the module, in cjs, it gets the default export which is the Ajv class.
import ajvModuleOrClass from "ajv";
import type { JsonTreeSchema } from "../../../simple-tree/index.js";

// The first case here covers the esm mode, and the second the cjs one.
// Getting correct typing for the cjs case without breaking esm compilation proved to be difficult, so that case uses `any`
const Ajv =
	(ajvModuleOrClass as typeof ajvModuleOrClass & { default: unknown }).default ??
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ajvModuleOrClass as any);

/**
 * Creates a JSON Schema validator for the provided schema, using `ajv`.
 */
export function getJsonValidator(
	schema: JsonTreeSchema,
): (data: unknown, expectValid: boolean) => void {
	const ajv = new Ajv({
		strict: false,
		allErrors: true,
	});
	const validator = ajv.compile(schema);

	return (data: unknown, expectValid: boolean) => {
		const valid = validator(data);
		if (expectValid && !valid) {
			throw new Error(
				`Data failed validation:\n\t${validator.errors
					?.map((error: unknown) => JSON.stringify(error))
					.join("\n\t")}`,
			);
		} else if (!expectValid && valid) {
			throw new Error(`Data passed validation when it shouldn't have.`);
		}
	};
}
