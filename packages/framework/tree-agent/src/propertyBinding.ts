/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema } from "@fluidframework/tree";
import {
	exposePropertiesSymbol,
	PropertyDef,
	isTypeFactoryType,
	type Ctor,
	type ExposedProperties,
	type IExposedProperties,
	type TypeFactoryType,
} from "@fluidframework/tree-agent-types/internal";

import type { BindableSchema } from "./methodBinding.js";

class ExposedPropertiesI implements ExposedProperties {
	private readonly properties: Record<string, PropertyDef> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public exposeProperty<S extends Ctor, K extends string>(
		schema: S,
		name: K,
		defOrType:
			| { schema: TypeFactoryType; description?: string; readOnly?: boolean }
			| TypeFactoryType,
	): void {
		if ((schema as unknown) !== (this.schemaClass as unknown)) {
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
