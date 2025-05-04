/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeKind, TreeNodeSchema } from "@fluidframework/tree";
import { z } from "zod";

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
export function getExposedMethods(schemaClass: NodeSchema): Record<string, z.ZodTypeAny> {
	return ExposedMethodsI.getExposedMethods(schemaClass);
}

interface Arg<T extends z.ZodTypeAny = z.ZodTypeAny> {
	name: string;
	type: T;
}

interface FunctionDef<
	Args extends readonly Arg[],
	Return extends z.ZodTypeAny,
	Rest extends z.ZodTypeAny = z.ZodUnknown,
> {
	name: string;
	description?: string;
	args: Args;
	rest?: Rest;
	returns: Return;
}

type ArgsTuple<T extends readonly Arg[]> = T extends [infer Single extends Arg]
	? [Single["type"]]
	: T extends [infer Head extends Arg, ...infer Tail extends Arg[]]
		? [Head["type"], ...ArgsTuple<Tail>]
		: never;

function buildFunc<
	Return extends z.ZodTypeAny,
	Args extends readonly Arg[],
	Rest extends z.ZodTypeAny = z.ZodUnknown,
>(
	def: { name: string; description?: string; returns: Return; rest?: Rest },
	...args: Args
): FunctionDef<Args, Return, Rest> {
	return {
		name: def.name,
		description: def.description,
		returns: def.returns,
		args,
		rest: def.rest,
	};
}

type Infer<T> = T extends FunctionDef<infer Args, infer Return, infer Rest>
	? z.infer<z.ZodFunction<z.ZodTuple<ArgsTuple<Args>, Rest>, Return>>
	: never;

const build = buildFunc(
	{
		name: "test",
		description: "A test function.",
		returns: z.boolean(),
		rest: z.bigint(),
	},
	{ name: "arg0", type: z.number() },
	{ name: "arg1", type: z.string() },
);

type inferred = Infer<typeof build>;

/**
 * An interface for exposing methods of schema classes to an agent.
 */
export interface ExposedMethods {
	expose<
		K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends NodeSchema & Ctor<{ [P in K]: z.infer<Z> }> & IExposedMethods,
		Z extends z.ZodFunction<any, any>,
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
	private readonly methods: Record<string, z.ZodTypeAny> = {};

	public constructor(private readonly schemaClass: NodeSchema) {}

	public expose<
		K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends NodeSchema & Ctor<{ [P in K]: z.infer<Z> }> & IExposedMethods,
		Z extends z.ZodFunction<any, any>,
	>(schema: S, methodName: K, zodFunction: Z): void {
		if (schema !== this.schemaClass) {
			throw new Error('Must expose methods on the "this" object');
		}
		this.methods[methodName] = zodFunction;
	}

	public static getExposedMethods(schemaClass: NodeSchema): Record<string, z.ZodTypeAny> {
		const exposedMethods = new ExposedMethodsI(schemaClass);
		const extractable = schemaClass as unknown as IExposedMethods;
		if (extractable[exposeMethodsSymbol] !== undefined) {
			extractable[exposeMethodsSymbol](exposedMethods);
		}
		return exposedMethods.methods;
	}
}
