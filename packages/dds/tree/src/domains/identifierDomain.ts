/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilderInternal } from "../feature-libraries/index.js";
import { ValueSchema } from "../index.js";

const identifierReferenceBuilder = new SchemaBuilderInternal({
	scope: "com.fluidframework.identifier",
});
/**
 * Built-in {@link IdentifierReferenceSchema}.
 * @internal
 */
export const identifierSchema = identifierReferenceBuilder.identifierReference(
	"identifierReference",
	ValueSchema.Number,
);
