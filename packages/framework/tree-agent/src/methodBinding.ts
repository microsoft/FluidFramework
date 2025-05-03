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
export function getExposedMethods(schemaClass: NodeSchema): Record<string, z.ZodTypeAny> {
	return ExposedMethodsI.getExposedMethods(schemaClass);
}

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
