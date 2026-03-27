/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Ctor } from "./methodBinding.js";
import type { TypeFactoryType } from "./treeAgentTypes.js";

/**
 * A symbol used to expose properties to the LLM.
 * @alpha
 */
export const exposePropertiesSymbol: unique symbol = Symbol.for(
	"@fluidframework/tree-agent/exposeProperties",
);

/**
 * An interface for exposing properties of schema classes to an agent.
 * @alpha
 */
export interface ExposedProperties {
	/**
	 * Expose a property with type factory type and metadata.
	 */
	exposeProperty<S extends Ctor, K extends string>(
		schema: S,
		name: K,
		def: { schema: TypeFactoryType; description?: string; readOnly?: boolean },
	): void;

	/**
	 * Expose a property with type factory type (simple form).
	 */
	exposeProperty<S extends Ctor, K extends string>(
		schema: S,
		name: K,
		tfType: TypeFactoryType,
	): void;
}

/**
 * An interface that SharedTree schema classes should implement to expose their properties to the LLM.
 *
 * @remarks
 * The `getExposedProperties` free function will cause the method here to be called on the class passed to it.
 *
 * @privateremarks
 * Implementing this interface correctly seems tricky?
 * To actually implement it in a way that satisfies TypeScript,
 * classes need to declare both a static version and an instance version of the method
 * (the instance one can just delegate to the static one).
 *
 * @alpha
 */
export interface IExposedProperties {
	/**
	 * Static method that exposes properties of this schema class to an agent.
	 */
	[exposePropertiesSymbol]?(properties: ExposedProperties): void;
}
