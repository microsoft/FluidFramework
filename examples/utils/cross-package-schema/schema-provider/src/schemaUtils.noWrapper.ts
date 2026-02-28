/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { SchemaFactoryAlpha } from "@fluid-example/tree-alpha";
// import type { ImplicitFieldSchema, RestrictiveStringRecord } from "@fluidframework/tree";
// import type { ObjectNodeSchema } from "@fluidframework/tree/alpha";
import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";

/**
 * Common schema factory
 */
export const sf = new SchemaFactoryAlpha("cross-package-example");

// /**
//  * Wraps the {@link SchemaFactoryAlpha.object} method, enabling `allowUnknownOptionalFields` by default.
//  * @privateRemarks This is a workaround for the fact that `SchemaFactoryAlpha.object` does not allow unknown optional fields by default.
//  * There is a lint rule enabled in this package that prevents the use of `SchemaFactoryAlpha.object` in favor of this function.
//  */
// export function sfObject<
// 	const TScope extends string,
// 	const Name extends string,
// 	const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
// >(
// 	schemaFactory: SchemaFactoryAlpha<TScope>,
// 	name: Name,
// 	fields: T,
// ): ObjectNodeSchema<`${TScope}.${Name}`, T, true> & {
// 	readonly createFromInsertable: unknown;
// } {
// 	const objectAlpha = schemaFactory.objectAlpha(name, fields, {
// 		allowUnknownOptionalFields: true,
// 	});
// 	return objectAlpha as typeof objectAlpha & ObjectNodeSchema<`${TScope}.${Name}`, T, true>;
// }
