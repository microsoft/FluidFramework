/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema, TreeNodeSchemaClass } from "@fluidframework/tree";
import { NodeKind } from "@fluidframework/tree";
import type { z } from "zod";

import { instanceOf } from "./renderZodTypeScript.js";
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
export type Arg<T extends z.ZodTypeAny | TypeFactoryType = z.ZodTypeAny | TypeFactoryType> =
	readonly [name: string, type: T];

/**
 * A function definition interface that describes the structure of a function.
 * @alpha
 */
export interface FunctionDef<
	Args extends readonly Arg[],
	Return extends z.ZodTypeAny | TypeFactoryType,
	Rest extends z.ZodTypeAny | TypeFactoryType | null = null,
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
	implements
		FunctionDef<
			readonly Arg[],
			z.ZodTypeAny | TypeFactoryType,
			z.ZodTypeAny | TypeFactoryType | null
		>
{
	public constructor(
		public readonly name: string,
		public readonly description: string | undefined,
		public readonly args: readonly Arg[],
		// eslint-disable-next-line @rushstack/no-new-null
		public readonly rest: z.ZodTypeAny | TypeFactoryType | null,
		public readonly returns: z.ZodTypeAny | TypeFactoryType,
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
	const Return extends z.ZodTypeAny | TypeFactoryType,
	const Args extends readonly Arg[],
	const Rest extends z.ZodTypeAny | TypeFactoryType | null = null,
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
 * A utility type that extracts inferred parameter types from Zod args.
 * @alpha
 */
export type InferArgsZod<Args extends readonly Arg<z.ZodTypeAny>[]> = Args extends readonly [
	infer Head extends Arg<z.ZodTypeAny>,
	...infer Tail extends readonly Arg<z.ZodTypeAny>[],
]
	? [z.infer<Head[1]>, ...InferArgsZod<Tail>]
	: [];

/**
 * A utility type that infers the function signature from a Zod function definition with strict type checking.
 * @alpha
 */
export type InferZod<T> = T extends FunctionDef<
	infer Args extends readonly Arg<z.ZodTypeAny>[],
	infer Return extends z.ZodTypeAny,
	any
>
	? (...args: InferArgsZod<Args>) => z.infer<Return>
	: never;

/**
 * A utility type that infers the function signature from a type factory function definition with relaxed type checking.
 * @alpha
 */
export type InferTypeFactory<T> = T extends FunctionDef<readonly Arg[], infer Return, any>
	? (...args: any[]) => any
	: never;

/**
 * A utility type that infers the return type of a function definition.
 * @alpha
 * @remarks
 * For Zod types, provides strict compile-time type checking. For type factory types, returns `any`.
 * @deprecated Use InferZod or InferTypeFactory directly for better type safety.
 */
export type Infer<T> = T extends FunctionDef<readonly Arg[], infer Return, any>
	? Return extends z.ZodTypeAny
		? InferZod<T>
		: InferTypeFactory<T>
	: never;

/**
 * An interface for exposing methods of schema classes to an agent.
 * @alpha
 */
export interface ExposedMethods {
	/**
	 * Expose a method with Zod types (strict compile-time type checking).
	 */
	expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends BindableSchema & Ctor<Record<K, InferZod<Z>>> & IExposedMethods,
		Z extends FunctionDef<readonly Arg<z.ZodTypeAny>[], z.ZodTypeAny, z.ZodTypeAny | null>,
	>(schema: S, methodName: K, zodFunction: Z): void;

	/**
	 * Expose a method with type factory types (relaxed compile-time type checking).
	 */
	expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends BindableSchema & Ctor & IExposedMethods,
		Z extends FunctionDef<
			readonly Arg<TypeFactoryType>[],
			TypeFactoryType,
			TypeFactoryType | null
		>,
	>(schema: S, methodName: K, tfFunction: Z): void;

	/**
	 * Create a Zod schema for a SharedTree schema class.
	 * @remarks
	 * Use it to "wrap" schema types that are referenced as arguments or return types when exposing methods with {@link ExposedMethods}.
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
		S extends BindableSchema & Ctor & IExposedMethods,
		Z extends FunctionDef<
			readonly Arg[],
			z.ZodTypeAny | TypeFactoryType,
			z.ZodTypeAny | TypeFactoryType | null
		>,
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
