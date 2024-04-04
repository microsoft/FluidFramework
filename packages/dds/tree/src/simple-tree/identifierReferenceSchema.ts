/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	NodeKind,
	TreeNodeSchema,
	TreeNodeSchemaIdentifier,
	TreeNodeSchemaNonClass,
	TreeValue,
	ValueSchema,
} from "../index.js";
import { setFlexSchemaFromClassSchema } from "./schemaCaching.js";
// eslint-disable-next-line import/no-internal-modules
import { IdentifierReferenceSchema as FlexIdentifierReferenceSchema } from "../feature-libraries/typed-schema/typedTreeSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { SchemaBuilderInternal } from "../feature-libraries/schemaBuilder.js";

const identifierReferenceBuilder = new SchemaBuilderInternal({
	scope: "com.fluidframework.identifier",
});
const identifier = identifierReferenceBuilder.identifierReference(
	"identifierReference",
	ValueSchema.Number,
);

type UnbrandedIdentifierName<T extends FlexIdentifierReferenceSchema> =
	T["name"] extends TreeNodeSchemaIdentifier<infer Name extends string> ? Name : T["name"];

class IdentifierReferenceSchema<T extends FlexIdentifierReferenceSchema>
	implements
		TreeNodeSchemaNonClass<
			UnbrandedIdentifierName<T>,
			NodeKind.IdentifierReference,
			TreeValue<T["info"]>
		>
{
	public readonly identifier: UnbrandedIdentifierName<T>;
	public readonly kind = NodeKind.IdentifierReference;
	public readonly info: T["info"];
	public readonly implicitlyConstructable = true as const;
	public create(data: TreeValue<T["info"]>): TreeValue<T["info"]> {
		return data;
	}

	public constructor(schema: T) {
		setFlexSchemaFromClassSchema(this, schema);
		this.identifier = schema.name as UnbrandedIdentifierName<T>;
		this.info = schema.info;
	}
}

function makeIdentifier<T extends FlexIdentifierReferenceSchema>(
	schema: T,
): TreeNodeSchema<
	UnbrandedIdentifierName<T>,
	NodeKind.IdentifierReference,
	TreeValue<T["info"]>,
	TreeValue<T["info"]>
> {
	return new IdentifierReferenceSchema(schema);
}

export const identifierSchema = makeIdentifier(identifier);
