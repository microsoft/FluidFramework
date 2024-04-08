/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Anchor, AnchorNode, FieldKey, TreeNodeSchemaIdentifier } from "../core/index.js";
import {
	FlexTreeContext,
	FlexTreeEntityKind,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeNodeEvents,
	FlexTreeNodeSchema,
	FlexTreeTypedNode,
	TreeStatus,
	flexTreeMarker,
} from "../feature-libraries/index.js";
import { fail } from "../util/index.js";

/** Stores the content of the raw node, i.e. the data that was passed to the factory */
export const nodeContent = Symbol();
interface HasNodeContent<T> {
	[nodeContent]: T;
}

/**
 * Retrieve the content of a raw object node created via {@link createRawNode}.
 * @remarks
 * Raw nodes should only ever be processed as input once.
 * Therefore, this extraction removes the content from the node and will error if called twice on the same node.
 */
export function extractRawNodeContent(node: object): object | undefined {
	if (node instanceof RawTreeNode) {
		const content = node[nodeContent] ?? fail("Node content may only be extracted once");
		Reflect.deleteProperty(node, nodeContent);
		return content as object;
	}

	return undefined;
}

/**
 * Node that pretends to satisfy the given schema while wrapping the given node content.
 * Retrieve the node content via {@link extractRawNodeContent}.
 *
 * @remarks This is useful for creating "raw" nodes: nodes which capture data about a pending insertion but are not yet inserted.
 * These raw nodes can be then used on the right-hand side of an assignment (via `=`) to the tree.
 * However, many of their properties and methods are currently unimplemented and will error if accessed.
 */
export abstract class RawTreeNode<TSchema extends FlexTreeNodeSchema, TContent>
	implements FlexTreeNode, HasNodeContent<TContent>
{
	public readonly [flexTreeMarker] = FlexTreeEntityKind.Node as const;
	public readonly [nodeContent]: TContent;

	#anchor: Anchor | undefined;

	public readonly type: TreeNodeSchemaIdentifier;

	public constructor(
		public readonly schema: TSchema,
		content: TContent,
	) {
		this.type = schema.name;
		this[nodeContent] = content;
	}

	public get context(): FlexTreeContext {
		throw rawError("Getting context");
	}

	public get parentField(): { parent: FlexTreeField; index: number } {
		throw rawError("Accessing parentage");
	}

	public is<TSchemaInner extends FlexTreeNodeSchema>(
		schema: TSchemaInner,
	): this is FlexTreeTypedNode<TSchemaInner> {
		return (schema as unknown) === this.schema;
	}

	public tryGetField(key: FieldKey): FlexTreeField | undefined {
		throw rawError("Reading fields");
	}

	public getBoxed(key: string): never {
		throw rawError("Reading boxed fields");
	}

	public boxedIterator(): IterableIterator<FlexTreeField> {
		throw rawError("Boxed iteration");
	}

	public treeStatus(): TreeStatus {
		// TODO: We could add a new TreeStatus for "raw" nodes.
		throw rawError("Status querying");
	}

	public value: undefined;

	public on<K extends keyof FlexTreeNodeEvents>(
		eventName: K,
		listener: FlexTreeNodeEvents[K],
	): () => void {
		throw rawError("Event registration");
	}

	public get anchorNode(): AnchorNode {
		throw rawError("Reading anchor node");
	}
}

export function rawError(message?: string): Error {
	return new Error(
		`${
			message ?? "Operation"
		} is not supported on content which has not yet been inserted into the tree`,
	);
}
