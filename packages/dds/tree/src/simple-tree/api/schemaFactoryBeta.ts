/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, scoped, type ScopedSchemaName } from "./schemaFactory.js";

/**
 * {@link SchemaFactory} with additional beta APIs.
 * @beta
 * @privateRemarks
 */
export class SchemaFactoryBeta<
	out TScope extends string | undefined = string | undefined,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	/**
	 * Create a {@link SchemaFactory} with a {@link SchemaFactory.scope|scope} which is a combination of this factory's scope and the provided name.
	 * @remarks
	 * The main use-case for this is when creating a collection of related schema (for example using a function that creates multiple schema).
	 * Creating such related schema using a sub-scope helps ensure they won't collide with other schema in the parent scope.
	 */
	public scopedFactory<const T extends TName, TNameInner extends number | string = string>(
		name: T,
	): SchemaFactoryBeta<ScopedSchemaName<TScope, T>, TNameInner> {
		return new SchemaFactoryBeta(scoped(this, name));
	}
}
