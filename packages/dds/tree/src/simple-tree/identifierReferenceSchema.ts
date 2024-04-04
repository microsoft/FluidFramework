/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IdentifierReferenceSchema as FlexIdentifierReferenceSchema,
	NodeKind,
	TreeNodeSchema,
	TreeNodeSchemaIdentifier,
	TreeNodeSchemaNonClass,
	TreeValue,
	identifierSchema,
} from "../index.js";
import { setFlexSchemaFromClassSchema } from "./schemaCaching.js";

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

export const identifierTreeNodeSchema = makeIdentifier(identifierSchema);
