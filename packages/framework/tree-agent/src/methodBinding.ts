/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeKind, TreeNodeSchema } from "@fluidframework/tree";
import type { z } from "zod";

/**
 * A utility type that extracts the method keys from a given type.
 */
export type MethodKeys<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
};

/**
 * A type that represents a constructor function.
 */
export type Ctor<T = any> = new (...args: any[]) => T;

/**
 * A type that represents an object schema class.
 */
export type NodeSchema = TreeNodeSchema<string, NodeKind.Object>;

/**
 * Get the exposed methods of a schema class.
 * @param schemaClass - The schema class to extract methods from.
 * @returns A record of method names and their corresponding Zod types.
 */
export function getExposedMethods(schemaClass: NodeSchema): Record<string, FunctionWrapper> {
	return ExposedMethodsI.getExposedMethods(schemaClass);
}

/**
 * A type that represents a function argument.
 */
export type Arg<T extends z.ZodTypeAny = z.ZodTypeAny> = readonly [name: string, type: T];

/**
 * A function definition interface that describes the structure of a function.
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
 */
export type ArgsTuple<T extends readonly Arg[]> = T extends readonly [infer Single extends Arg]
	? [Single[1]]
	: T extends readonly [infer Head extends Arg, ...infer Tail extends readonly Arg[]]
		? [Head[1], ...ArgsTuple<Tail>]
		: never;

/**
 * A utility function to build a function definition.
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
 */
export type Infer<T> = T extends FunctionDef<infer Args, infer Return, infer Rest>
	? z.infer<z.ZodFunction<z.ZodTuple<ArgsTuple<Args>, Rest>, Return>>
	: never;

/**
 * An interface for exposing methods of schema classes to an agent.
 */
export interface ExposedMethods {
	expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends NodeSchema & Ctor<{ [P in K]: Infer<Z> }> & IExposedMethods,
		Z extends FunctionDef<any, any, any>,
	>(schema: S, methodName: K, zodFunction: Z): void;
}

/**
 * A symbol used to expose methods to the LLM.
 */
export const exposeMethodsSymbol: unique symbol = Symbol("run");

/**
 * An interface for exposing schema class methods to the LLM.
 */
export interface IExposedMethods {
	[exposeMethodsSymbol](methods: ExposedMethods): void;
}

class ExposedMethodsI implements ExposedMethods {
	private readonly methods: Record<string, FunctionWrapper> = {};

	public constructor(private readonly schemaClass: NodeSchema) {}

	public expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends NodeSchema & Ctor<{ [P in K]: Infer<Z> }> & IExposedMethods,
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

	public static getExposedMethods(schemaClass: NodeSchema): Record<string, FunctionWrapper> {
		const exposedMethods = new ExposedMethodsI(schemaClass);
		const extractable = schemaClass as unknown as IExposedMethods;
		if (extractable[exposeMethodsSymbol] !== undefined) {
			extractable[exposeMethodsSymbol](exposedMethods);
		}
		return exposedMethods.methods;
	}
}
