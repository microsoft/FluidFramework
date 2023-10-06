/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKind, FieldKinds, schemaBuilder3 } from "../feature-libraries";
import { ValueSchema } from "../core";

class ExtendedSchemaBuilder<
	TFieldKinds extends Record<string, FieldKind>,
	TScope extends string,
	TName extends number | string = string,
> extends schemaBuilder3.SchemaBuilder<TFieldKinds, TScope, TName> {
	public leaf<Name extends TName, T extends ValueSchema>(
		name: Name,
		valueSchema: T,
	): schemaBuilder3.Holder<{ identifier: `${TScope}.${Name}`; leafValue: T }> {
		const identifier = this.scoped(name);
		const schema = class {
			public static readonly identifier = identifier;
			public static readonly leafValue = valueSchema;
			public readonly identifier = identifier;
			public readonly leafValue = valueSchema;
			public constructor(dummy: never) {}
		};
		this.addNodeSchema(schema);
		return schema;
	}
}

/**
 * Names in this domain follow https://en.wikipedia.org/wiki/Reverse_domain_name_notation
 */
const builder = new ExtendedSchemaBuilder({
	scope: "com.fluidframework.leaf",
	fieldKinds: FieldKinds,
});

/**
 * @alpha
 */
export const number = builder.leaf("number", ValueSchema.Number);
/**
 * @alpha
 */
export const boolean = builder.leaf("boolean", ValueSchema.Boolean);
/**
 * @alpha
 */
export const string = builder.leaf("string", ValueSchema.String);
/**
 * @alpha
 */
export const handle = builder.leaf("handle", ValueSchema.FluidHandle);

/**
 * @alpha
 */
export const primitives = [number, boolean, string] as const;

/**
 * Types allowed as roots of Json content.
 * @alpha
 */
export const all = [primitives, ...primitives] as const;

/**
 * @alpha
 */
// export const library = builder.finalize();
