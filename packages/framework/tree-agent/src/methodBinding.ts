/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeKind, TreeNodeSchema, TreeNodeSchemaClass } from "@fluidframework/tree";
import type { z } from "zod";

import { instanceOf } from "./utils.js";

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
export type Arg<T extends z.ZodTypeAny = z.ZodTypeAny> = readonly [name: string, type: T];

/**
 * A function definition interface that describes the structure of a function.
 * @alpha
 */
export interface FunctionDef<
	Args extends readonly Arg[],
	Return extends z.ZodTypeAny,
	Rest extends z.ZodTypeAny | null = null,
> {
	description?: string;
	args: Args;
	rest?: Rest;
	returns: Return;
}

/**
 * A class that implements the FunctionDef interface.
 */
export class FunctionWrapper
	implements FunctionDef<readonly Arg[], z.ZodTypeAny, z.ZodTypeAny | null>
{
	public constructor(
		public readonly name: string,
		public readonly description: string | undefined,
		public readonly args: readonly Arg[],
		// eslint-disable-next-line @rushstack/no-new-null
		public readonly rest: z.ZodTypeAny | null,
		public readonly returns: z.ZodTypeAny,
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
	const Return extends z.ZodTypeAny,
	const Args extends readonly Arg[],
	const Rest extends z.ZodTypeAny | null = null,
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
 * A utility type that infers the return type of a function definition.
 * @alpha
 */
export type Infer<T> = T extends FunctionDef<infer Args, infer Return, infer Rest>
	? z.infer<z.ZodFunction<z.ZodTuple<ArgsTuple<Args>, Rest>, Return>>
	: never;

/**
 * An interface for exposing methods of schema classes to an agent.
 * @alpha
 */
export interface ExposedMethods {
	expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends BindableSchema & Ctor<{ [P in K]: Infer<Z> }> & IExposedMethods,
		Z extends FunctionDef<any, any, any>,
	>(schema: S, methodName: K, zodFunction: Z): void;

	/**
	 * Create a Zod schema for a SharedTree schema class.
	 * @remarks
	 * Use it to "wrap" schema types that are referenced as arguments or return types when exposing methods (with {@link ExposedMethods.expose}).
	 */
	instanceOf<T extends TreeNodeSchemaClass>(
		schema: T,
	): z.ZodType<InstanceType<T>, z.ZodTypeDef, InstanceType<T>>;
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
	[exposeMethodsSymbol](methods: ExposedMethods): void;
}

class ExposedMethodsI implements ExposedMethods {
	private readonly methods: Record<string, FunctionWrapper> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends BindableSchema & Ctor<{ [P in K]: Infer<Z> }> & IExposedMethods,
		Z extends FunctionDef<readonly Arg[], z.ZodTypeAny, z.ZodTypeAny | null>,
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

	public instanceOf<T extends TreeNodeSchemaClass>(
		schema: T,
	): z.ZodType<InstanceType<T>, z.ZodTypeDef, InstanceType<T>> {
		this.referencedTypes.add(schema);
		return instanceOf(schema);
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
