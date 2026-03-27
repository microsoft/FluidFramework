/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

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
		S extends Ctor & IExposedMethods,
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
