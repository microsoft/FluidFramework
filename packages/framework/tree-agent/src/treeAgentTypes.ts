/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNodeSchemaClass } from "@fluidframework/tree/alpha";
import { ObjectNodeSchema } from "@fluidframework/tree/alpha";
import { typeFactory as baseTypeFactory } from "@fluidframework/tree-agent-types/internal";
import type { TypeFactoryType } from "@fluidframework/tree-agent-types/internal";

/**
 * Represents an instanceof type that references a SharedTree schema class in the type factory system.
 * @alpha
 */
export interface TypeFactoryInstanceOf extends TypeFactoryType {
	/**
	 * The kind of type this represents.
	 */
	readonly _kind: "instanceof";
	/**
	 * The SharedTree schema class to reference.
	 */
	readonly schema: ObjectNodeSchema;
}

/**
 * Namespace containing type factory functions.
 * @alpha
 */
export const typeFactory = {
	...baseTypeFactory,

	/**
	 * Create an instanceOf type for a SharedTree schema class.
	 * @alpha
	 */
	instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeFactoryInstanceOf {
		if (!(schema instanceof ObjectNodeSchema)) {
			throw new UsageError(
				`typeFactory.instanceOf only supports ObjectNodeSchema-based schema classes (created via SchemaFactory.object). ` +
					`Pass a schema class that extends from an object schema (e.g., sf.object(...)), not primitive, array, or map schemas.`,
			);
		}
		const instanceOfType: TypeFactoryInstanceOf = {
			_kind: "instanceof",
			schema,
		};
		return instanceOfType;
	},
};
