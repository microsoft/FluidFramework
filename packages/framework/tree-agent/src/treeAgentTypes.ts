/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNodeSchemaClass } from "@fluidframework/tree/alpha";
import { ObjectNodeSchema } from "@fluidframework/tree/alpha";
import { typeFactory as baseTypeFactory } from "@fluidframework/type-factory/internal";
import type { TypeFactoryInstanceOf } from "@fluidframework/type-factory/internal";

/**
 * Namespace containing type factory functions.
 * @alpha
 */
export const typeFactory = {
	...baseTypeFactory,

	/**
	 * Create an instanceOf type for a SharedTree schema class.
	 * @remarks
	 * This is a narrower override that constrains the schema to `ObjectNodeSchema`.
	 * @alpha
	 */
	instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeFactoryInstanceOf {
		if (!(schema instanceof ObjectNodeSchema)) {
			throw new UsageError(
				`typeFactory.instanceOf only supports ObjectNodeSchema-based schema classes (created via SchemaFactory.object). ` +
					`Pass a schema class that extends from an object schema (e.g., sf.object(...)), not primitive, array, or map schemas.`,
			);
		}
		return { _kind: "instanceof", constructor: schema };
	},
};
