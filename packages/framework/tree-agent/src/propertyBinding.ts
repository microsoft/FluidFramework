/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema, TreeNodeSchemaClass } from "@fluidframework/tree";
import type { ZodType, ZodTypeAny, ZodTypeDef, infer as ZodInfer } from "zod";

import type { BindableSchema, Ctor } from "./methodBinding.js";
import { instanceOf } from "./renderZodTypeScript.js";

/**
 * A symbol used to expose properties to the LLM.
 * @alpha
 */
export const exposePropertiesSymbol: unique symbol = Symbol.for(
	"@fluidframework/tree-agent/exposeProperties",
);

/**
 * Set of property keys from `T` that are not methods.
 * @alpha
 */
export type ExposableKeys<T> = {
	[K in keyof T]?: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];

/**
 * Type-level equality test used as a helper to evaluate readonly keys.
 * - If X and Y are the same type, it evaluates to A.
 * - If X and Y are different, it evaluates to B.
 * @alpha
 */
export type IfEquals<X, Y, A = true, B = false> = (<T>() => T extends X ? 1 : 2) extends <
	T,
>() => T extends Y ? 1 : 2
	? A
	: B;

/**
 * Produces a union of keys of `T` which are readonly.
 * @alpha
 */
export type ReadonlyKeys<T> = {
	// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
	[P in keyof T]-?: IfEquals<{ [Q in P]: T[P] }, { -readonly [Q in P]: T[P] }, never, P>;
}[keyof T];

/**
 * Type to enforce `readOnly: true` for readonly properties.
 * @alpha
 */
export type ReadOnlyRequirement<TObj, K extends keyof TObj> = {
	[P in K]-?: P extends ReadonlyKeys<TObj> ? { readOnly: true } : { readOnly?: false };
}[K];

/**
 * Emits compile-time error when there is a type mismatch.
 * @alpha
 */
export type TypeMatchOrError<Expected, Received> = [Received] extends [Expected]
	? unknown
	: {
			__error__: "Zod schema value type does not match the property's declared type";
			expected: Expected;
			received: Received;
		};

/**
 * A property definition class that describes the structure of the property
 * @alpha
 */
export class PropertyDef {
	public constructor(
		public readonly name: string,
		public readonly description: string | undefined,
		public readonly schema: ZodTypeAny,
		public readonly readOnly: boolean,
	) {}
}

/**
 * An interface for exposing properties of schema classes to an agent.
 * @alpha
 */
export interface ExposedProperties {
	exposeProperty<
		S extends BindableSchema & Ctor,
		K extends string & ExposableKeys<InstanceType<S>>,
		TZ extends ZodTypeAny,
	>(
		schema: S,
		name: K,
		def: { schema: TZ; description?: string } & ReadOnlyRequirement<InstanceType<S>, K> &
			TypeMatchOrError<InstanceType<S>[K], ZodInfer<TZ>>,
	): void;

	instanceOf<T extends TreeNodeSchemaClass>(
		schema: T,
	): ZodType<InstanceType<T>, ZodTypeDef, InstanceType<T>>;
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
	[exposePropertiesSymbol]?(properties: ExposedProperties): void;
}

class ExposedPropertiesI implements ExposedProperties {
	private readonly properties: Record<string, PropertyDef> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public exposeProperty<
		S extends BindableSchema & Ctor,
		K extends string & ExposableKeys<InstanceType<S>>,
		TZ extends ZodTypeAny,
	>(
		schema: S,
		name: K,
		def: { schema: TZ; description?: string } & ReadOnlyRequirement<InstanceType<S>, K> &
			TypeMatchOrError<InstanceType<S>[K], ZodInfer<TZ>>,
	): void {
		if (schema !== this.schemaClass) {
			throw new Error('Must expose properties on the "this" schema class');
		}
		this.properties[name] = new PropertyDef(
			name,
			def.description,
			def.schema,
			def.readOnly === true,
		);
	}

	public instanceOf<T extends TreeNodeSchemaClass>(
		schema: T,
	): ZodType<InstanceType<T>, ZodTypeDef, InstanceType<T>> {
		this.referencedTypes.add(schema);
		return instanceOf(schema);
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
 * @returns A record of property names and their corresponding Zod types.
 */
export function getExposedProperties(schemaClass: BindableSchema): {
	properties: Record<string, PropertyDef>;
	referencedTypes: Set<TreeNodeSchema>;
} {
	return ExposedPropertiesI.getExposedProperties(schemaClass);
}
