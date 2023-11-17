/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, TreeNodeSchemaIdentifier } from "../core";
import { capitalize } from "../util";
import {
	ObjectNodeSchema,
	TreeNodeSchema,
	LocalNodeKey,
	FlexTreeContext,
	EditableTreeEvents,
	FlexTreeObjectNode,
	FlexTreeObjectNodeTyped,
	FlexTreeField,
	FlexTreeNode,
	TreeStatus,
	FlexTreeTypedNode,
	boxedIterator,
	onNextChange,
} from "../feature-libraries";

const nodeContent = Symbol();
interface HasNodeContent<T> {
	[nodeContent]: T;
}

/**
 * Retrieve the content of a raw object node created via {@link createRawObjectNode}.
 * @remarks
 * The content is removed from the node when this is called.
 * Therefore, this can only be successfully called once on the same node.
 */
export function extractRawNodeContent<TSchema extends ObjectNodeSchema, TContent>(
	node: RawObjectNode<TSchema, TContent>,
): TContent;
export function extractRawNodeContent(node: FlexTreeNode): object | undefined;
export function extractRawNodeContent(node: object): object | undefined {
	const content = (node as Partial<HasNodeContent<object>>)[nodeContent];
	if (content !== undefined) {
		Reflect.deleteProperty(node, nodeContent);
	}

	return content;
}

/**
 * Creates a node that falsely pretends to satisfy the given schema while wrapping the given node content.
 * Retrieve the node content via {@link extractRawNodeContent}.
 *
 * @remarks This is useful for creating "raw" nodes: nodes which capture data about a pending insertion but are not yet inserted.
 * These raw nodes can be then used on the right-hand side of an assignment (via `=`) to the tree.
 * However, their properties and methods should not be inspected (other than `schema` and `type`) since they are not implemented; they will error.
 */
export function createRawObjectNode<TSchema extends ObjectNodeSchema, TContent extends object>(
	schema: TSchema,
	content: TContent,
): RawObjectNode<TSchema, TContent> & FlexTreeObjectNodeTyped<TSchema> {
	const node = new RawObjectNode(schema, content);
	for (const [key] of schema.objectNodeFields) {
		Object.defineProperty(node, key, {
			get: () => rawObjectNodeError(),
			set: () => rawObjectNodeError(),
			enumerable: true,
		});
		Object.defineProperty(node, `boxed${capitalize(key)}`, {
			get: () => rawObjectNodeError(),
			set: () => rawObjectNodeError(),
			enumerable: false,
		});
	}
	return node as RawObjectNode<TSchema, TContent> & FlexTreeObjectNodeTyped<TSchema>;
}

class RawObjectNode<TSchema extends ObjectNodeSchema, TContent> implements FlexTreeObjectNode {
	public constructor(
		public readonly schema: TSchema,
		content: TContent,
	) {
		this[nodeContent] = content;
	}

	// Use a symbol here so that it will never collide with a field name
	public readonly [nodeContent]: TContent;

	public get type(): TreeNodeSchemaIdentifier {
		return this.schema.name;
	}

	public get context(): FlexTreeContext {
		return rawObjectNodeError();
	}

	public get parentField(): { readonly parent: FlexTreeField; readonly index: number } {
		return rawObjectNodeError();
	}

	public tryGetField(key: FieldKey): FlexTreeField | undefined {
		return rawObjectNodeError();
	}

	public [boxedIterator](): IterableIterator<FlexTreeField> {
		return rawObjectNodeError();
	}

	public on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void {
		return rawObjectNodeError();
	}

	public [onNextChange](): () => void {
		return rawObjectNodeError();
	}

	public is<TSchemaCheck extends TreeNodeSchema>(
		schema: TSchemaCheck,
	): this is FlexTreeTypedNode<TSchemaCheck> {
		return rawObjectNodeError();
	}

	public treeStatus(): TreeStatus {
		return rawObjectNodeError();
	}

	public get localNodeKey(): LocalNodeKey | undefined {
		return rawObjectNodeError();
	}
}

function rawObjectNodeError(): never {
	throw new Error(rawObjectErrorMessage);
}

export const rawObjectErrorMessage =
	"Newly created node must be inserted into the tree before being queried";
