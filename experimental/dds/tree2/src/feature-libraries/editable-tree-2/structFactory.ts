/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { SessionSpaceCompressedId } from "@fluidframework/runtime-definitions";
import { FieldKey, TreeSchemaIdentifier } from "../../core";
import { BrandedType, capitalize } from "../../util";
import { StructSchema, TreeSchema } from "../typed-schema";
import { EditableTreeEvents } from "../untypedTree";
import { TreeContext } from "./context";
import {
	Struct,
	StructTyped,
	TreeField,
	TreeStatus,
	TypedNode,
	boxedIterator,
} from "./editableTreeTypes";

/**
 * Creates a node that falsely pretends to satisfy the given schema.
 *
 * @remarks This is useful for creating "raw" nodes: nodes which capture data about a pending insertion but are not yet inserted.
 * These raw nodes can be then used on the right-hand side of an assignment (via `=`) to the tree.
 * However, their properties and methods should not be inspected (other than `schema` and `type`) since they are not implemented; they will error.
 *
 * @privateRemarks TODO: Generate these from schema, and use them to support `=` for structs by carrying contextually typed data.
 */
export function createRawStruct<TSchema extends StructSchema>(
	schema: TSchema,
): StructTyped<TSchema> {
	const node = new RawStruct(schema);
	for (const [key] of schema.structFields) {
		Object.defineProperty(node, key, {
			get: () => rawStructError(),
			set: () => rawStructError(),
			enumerable: true,
		});
		Object.defineProperty(node, `boxed${capitalize(key)}`, {
			get: () => rawStructError(),
			set: () => rawStructError(),
			enumerable: false,
		});
	}
	return node as unknown as StructTyped<TSchema>;
}

class RawStruct<TSchema extends StructSchema> implements Struct {
	public constructor(public readonly schema: TSchema) {}

	public get type(): TreeSchemaIdentifier {
		return this.schema.name;
	}

	public get context(): TreeContext {
		return rawStructError();
	}

	public get parentField(): { readonly parent: TreeField; readonly index: number } {
		return rawStructError();
	}

	public tryGetField(key: FieldKey): TreeField | undefined {
		return rawStructError();
	}

	public [boxedIterator](): IterableIterator<TreeField> {
		return rawStructError();
	}

	public on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void {
		return rawStructError();
	}

	public is<TSchemaCheck extends TreeSchema>(
		schema: TSchemaCheck,
	): this is TypedNode<TSchemaCheck> {
		assert(
			this.context.schema.treeSchema.get(schema.name) === schema,
			0x785 /* Narrowing must be done to a schema that exists in this context */,
		);
		return (this.schema as TreeSchema) === schema;
	}

	public treeStatus(): TreeStatus {
		return rawStructError();
	}

	public get localNodeKey(): BrandedType<SessionSpaceCompressedId, "Local Node Key"> | undefined {
		return rawStructError();
	}
}

function rawStructError(): never {
	throw new Error(rawStructErrorMessage);
}

export const rawStructErrorMessage =
	"Newly created node must be inserted into the tree before being queried";
