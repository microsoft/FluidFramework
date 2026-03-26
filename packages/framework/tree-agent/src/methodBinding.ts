/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema } from "@fluidframework/tree";
import { NodeKind } from "@fluidframework/tree";
import {
	exposeMethodsSymbol,
	FunctionWrapper,
	type Arg,
	type Ctor,
	type ExposedMethods,
	type FunctionDef,
	type IExposedMethods,
	type MethodKeys,
	type TypeFactoryType,
} from "@fluidframework/tree-agent-types/internal";

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

class ExposedMethodsI implements ExposedMethods {
	private readonly methods: Record<string, FunctionWrapper> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public expose<
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		S extends Ctor & IExposedMethods,
		Z extends FunctionDef<readonly Arg[], TypeFactoryType, TypeFactoryType | null>,
	>(schema: S, methodName: K, functionDef: Z): void {
		if ((schema as unknown) !== (this.schemaClass as unknown)) {
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
