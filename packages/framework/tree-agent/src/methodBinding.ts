/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema } from "@fluidframework/tree";
import { NodeKind } from "@fluidframework/tree";

import type { TypeFactoryType } from "./treeAgentTypes.js";

/**
 * A utility type that extracts the method keys from a given type.
 * @alpha
 */
export type MethodKeys<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
};

/**
 * A type that represents a constructor function.
 * @alpha
 */
export type Ctor<T = any> = new (...args: any[]) => T;

/**
 * A type that represents an object schema class.
 * @alpha
 */
export type BindableSchema =
	| TreeNodeSchema<string, NodeKind.Object>
	| TreeNodeSchema<string, NodeKind.Record>
	| TreeNodeSchema<string, NodeKind.Array>
	| TreeNodeSchema<string, NodeKind.Map>;

/**
 * A type guard to check if a schema is {@link BindableSchema | bindable}.
 */
export function isBindableSchema(schema: TreeNodeSchema): schema is BindableSchema {
	return (
		schema.kind === NodeKind.Object ||
		schema.kind === NodeKind.Record ||
		schema.kind === NodeKind.Array ||
		schema.kind === NodeKind.Map
	);
}

/**
 * Get the exposed methods of a schema class.
 * @param schemaClass - The schema class to extract methods from.
 * @returns A record of method names and their corresponding Zod types.
 */
export function getExposedMethods(schemaClass: BindableSchema): {
	methods: Record<string, FunctionWrapper>;
	referencedTypes: Set<TreeNodeSchema>;
} {
	return ExposedMethodsI.getExposedMethods(schemaClass);
}

/**
 * A type that represents a function argument.
 * @alpha
 */
export type Arg<T extends TypeFactoryType = TypeFactoryType> = readonly [
	name: string,
	type: T,
];

/**
 * A function definition interface that describes the structure of a function.
 * @alpha
 */
export interface FunctionDef<
	Args extends readonly Arg[],
	Return extends TypeFactoryType,
	Rest extends TypeFactoryType | null = null,
> {
	/**
	 * Optional description of the function.
	 */
	description?: string;
	/**
	 * The function's parameters.
	 */
	args: Args;
	/**
	 * Optional rest parameter type.
	 */
	rest?: Rest;
	/**
	 * The function's return type.
	 */
	returns: Return;
}

/**
 * A class that implements the FunctionDef interface.
 */
export class FunctionWrapper
	implements FunctionDef<readonly Arg[], TypeFactoryType, TypeFactoryType | null>
{
	public constructor(
		public readonly name: string,
		public readonly description: string | undefined,
		public readonly args: readonly Arg[],
		// eslint-disable-next-line @rushstack/no-new-null
		public readonly rest: TypeFactoryType | null,
		public readonly returns: TypeFactoryType,
	) {}
}

/**
 * A utility type that extracts the argument types from a function definition.
 * @alpha
 */
export type ArgsTuple<T extends readonly Arg[]> = T extends readonly [infer Single extends Arg]
	? [Single[1]]
	: T extends readonly [infer Head extends Arg, ...infer Tail extends readonly Arg[]]
		? [Head[1], ...ArgsTuple<Tail>]
		: never;

/**
 * A utility function to build a function definition.
 * @alpha
 */
export function buildFunc<
	const Return extends TypeFactoryType,
	const Args extends readonly Arg[],
	const Rest extends TypeFactoryType | null = null,
>(
	def: { description?: string; returns: Return; rest?: Rest },
	...args: Args
): FunctionDef<Args, Return, Rest> {
	return {
		description: def.description,
		returns: def.returns,
		args,
		rest: def.rest,
	};
}

/**
 * An interface for exposing methods of schema classes to an agent.
 * @alpha
 */
export interface ExposedMethods {
	/**
	 * Expose a method with type factory types.
	 */
	expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends BindableSchema & Ctor & IExposedMethods,
		Z extends FunctionDef<readonly Arg[], TypeFactoryType, TypeFactoryType | null>,
	>(schema: S, methodName: K, tfFunction: Z): void;
}

/**
 * A symbol used to expose methods to the LLM.
 * @alpha
 */
export const exposeMethodsSymbol: unique symbol = Symbol("run");

/**
 * An interface that SharedTree schema classes should implement to expose their methods to the LLM.
 *
 * @remarks
 * The `getExposedMethods` free function will cause the method here to be called on the class passed to it.
 *
 * @privateremarks
 * Implementing this interface correctly seems tricky?
 * To actually implement it in a way that satisfies TypeScript,
 * classes need to declare both a static version and an instance version of the method
 * (the instance one can just delegate to the static one).
 *
 * @alpha
 */
export interface IExposedMethods {
	/**
	 * Static method that exposes methods of this schema class to an agent.
	 */
	[exposeMethodsSymbol](methods: ExposedMethods): void;
}

class ExposedMethodsI implements ExposedMethods {
	private readonly methods: Record<string, FunctionWrapper> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends BindableSchema & Ctor & IExposedMethods,
		Z extends FunctionDef<readonly Arg[], TypeFactoryType, TypeFactoryType | null>,
	>(schema: S, methodName: K, functionDef: Z): void {
		if (schema !== this.schemaClass) {
			throw new Error('Must expose methods on the "this" object');
		}
		this.methods[methodName] = new FunctionWrapper(
			methodName,
			functionDef.description,
			functionDef.args,
			// eslint-disable-next-line unicorn/no-null
			functionDef.rest ?? null,
			functionDef.returns,
		);
	}

	public static getExposedMethods(schemaClass: BindableSchema): {
		methods: Record<string, FunctionWrapper>;
		referencedTypes: Set<TreeNodeSchema>;
	} {
		const exposedMethods = new ExposedMethodsI(schemaClass);
		const extractable = schemaClass as unknown as IExposedMethods;
		if (extractable[exposeMethodsSymbol] !== undefined) {
			extractable[exposeMethodsSymbol](exposedMethods);
		}
		return {
			methods: exposedMethods.methods,
			referencedTypes: exposedMethods.referencedTypes,
		};
	}
}
