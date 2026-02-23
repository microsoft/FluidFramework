/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema } from "@fluidframework/tree";

import type { BindableSchema, Ctor } from "./methodBinding.js";
import type { TypeFactoryType } from "./treeAgentTypes.js";
import { isTypeFactoryType } from "./treeAgentTypes.js";

/**
 * A symbol used to expose properties to the LLM.
 * @alpha
 */
export const exposePropertiesSymbol: unique symbol = Symbol.for(
	"@fluidframework/tree-agent/exposeProperties",
);

/**
 * A property definition class that describes the structure of the property
 * @alpha
 */
export class PropertyDef {
	public constructor(
		/**
		 * The name of the property.
		 */
		public readonly name: string,
		/**
		 * Optional description of the property.
		 */
		public readonly description: string | undefined,
		/**
		 * The schema defining the property's type.
		 */
		public readonly schema: TypeFactoryType,
		/**
		 * Whether the property is readonly.
		 */
		public readonly readOnly: boolean,
	) {}
}

/**
 * An interface for exposing properties of schema classes to an agent.
 * @alpha
 */
export interface ExposedProperties {
	/**
	 * Expose a property with type factory type and metadata.
	 */
	exposeProperty<S extends BindableSchema & Ctor, K extends string>(
		schema: S,
		name: K,
		def: { schema: TypeFactoryType; description?: string; readOnly?: boolean },
	): void;

	/**
	 * Expose a property with type factory type (simple form).
	 */
	exposeProperty<S extends BindableSchema & Ctor, K extends string>(
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

class ExposedPropertiesI implements ExposedProperties {
	private readonly properties: Record<string, PropertyDef> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public exposeProperty<S extends BindableSchema & Ctor, K extends string>(
		schema: S,
		name: K,
		defOrType:
			| { schema: TypeFactoryType; description?: string; readOnly?: boolean }
			| TypeFactoryType,
	): void {
		if (schema !== this.schemaClass) {
			throw new Error('Must expose properties on the "this" schema class');
		}

		// Handle TypeFactoryType (simple case - type passed directly)
		if (isTypeFactoryType(defOrType)) {
			this.properties[name] = new PropertyDef(name, undefined, defOrType, false);
		} else {
			// Handle object with schema property
			const def = defOrType as {
				schema: TypeFactoryType;
				description?: string;
				readOnly?: boolean;
			};
			this.properties[name] = new PropertyDef(
				name,
				def.description,
				def.schema,
				def.readOnly === true,
			);
		}
	}

	public static getExposedProperties(schemaClass: BindableSchema): {
		properties: Record<string, PropertyDef>;
		referencedTypes: Set<TreeNodeSchema>;
	} {
		const exposed = new ExposedPropertiesI(schemaClass);
		const extractable = schemaClass as unknown as IExposedProperties;
		if (extractable[exposePropertiesSymbol] !== undefined) {
			extractable[exposePropertiesSymbol](exposed);
		}
		return {
			properties: exposed.properties,
			referencedTypes: exposed.referencedTypes,
		};
	}
}

/**
 * Get the exposed properties of a schema class.
 * @param schemaClass - The schema class to extract properties from.
 * @returns A record of property names and their corresponding TypeFactory types.
 */
export function getExposedProperties(schemaClass: BindableSchema): {
	properties: Record<string, PropertyDef>;
	referencedTypes: Set<TreeNodeSchema>;
} {
	return ExposedPropertiesI.getExposedProperties(schemaClass);
}
