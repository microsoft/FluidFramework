/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, TreeNodeSchemaIdentifier } from "../core/index.js";
import {
	FlexFieldNodeSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	FlexTreeContext,
	FlexTreeEntityKind,
	FlexTreeField,
	FlexTreeFieldNode,
	FlexTreeMapNode,
	FlexTreeNode,
	FlexTreeNodeEvents,
	FlexTreeNodeSchema,
	FlexTreeObjectNode,
	FlexTreeTypedField,
	FlexTreeTypedNode,
	FlexTreeUnboxField,
	FlexibleFieldContent,
	LocalNodeKey,
	TreeStatus,
	flexTreeMarker,
	onNextChange,
} from "../feature-libraries/index.js";
import { fail } from "../util/index.js";
import { InsertableContent } from "./proxies.js";

/** Stores the content of the raw node, i.e. the data that was passed to the factory */
const nodeContent = Symbol();
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
 * Creates a node that pretends to satisfy the given schema while wrapping the given node content.
 * Retrieve the node content via {@link extractRawNodeContent}.
 *
 * @remarks This is useful for creating "raw" nodes: nodes which capture data about a pending insertion but are not yet inserted.
 * These raw nodes can be then used on the right-hand side of an assignment (via `=`) to the tree.
 * However, many of their properties and methods are currently unimplemented and will error if accessed.
 */
export function createRawNode(
	schema: FlexTreeNodeSchema,
	content: InsertableContent,
): RawTreeNode<FlexTreeNodeSchema, InsertableContent> {
	if (schema instanceof FlexObjectNodeSchema) {
		return new RawObjectNode(schema, content as object);
	}
	if (schema instanceof FlexMapNodeSchema) {
		return new RawMapNode(schema, content as ReadonlyMap<string, InsertableContent>);
	}
	if (schema instanceof FlexFieldNodeSchema) {
		return new RawFieldNode(schema, content);
	}
	fail("Unrecognized schema");
}

/**
 * The base implementation of a node created by {@link createRawNode}.
 */
export abstract class RawTreeNode<TSchema extends FlexTreeNodeSchema, TContent>
	implements FlexTreeNode, HasNodeContent<TContent>
{
	public readonly [flexTreeMarker] = FlexTreeEntityKind.Node as const;
	public readonly [nodeContent]: TContent;

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

	public [onNextChange](fn: (node: FlexTreeNode) => void): () => void {
		throw rawError("onNextChange event registration");
	}
}

/**
 * The implementation of an object node created by {@link createRawNode}.
 */
export class RawObjectNode<TSchema extends FlexObjectNodeSchema, TContent extends object>
	extends RawTreeNode<TSchema, TContent>
	implements FlexTreeObjectNode
{
	public get localNodeKey(): LocalNodeKey | undefined {
		throw rawError("Reading local node keys");
	}
}

/**
 * The implementation of a map node created by {@link createRawNode}.
 */
export class RawMapNode<TSchema extends FlexMapNodeSchema>
	extends RawTreeNode<TSchema, ReadonlyMap<string, InsertableContent>>
	implements FlexTreeMapNode<TSchema>
{
	public get size(): number {
		return this[nodeContent].size;
	}
	public has(key: string): boolean {
		return this[nodeContent].has(key);
	}
	public get(key: string): FlexTreeUnboxField<TSchema["info"]> {
		return this[nodeContent].get(key) as FlexTreeUnboxField<TSchema["info"]>;
	}
	public getBoxed(key: string): FlexTreeTypedField<TSchema["info"]> {
		throw rawError("Reading boxed map values");
	}
	public keys(): IterableIterator<FieldKey> {
		return this[nodeContent].keys() as IterableIterator<FieldKey>;
	}
	public values(): IterableIterator<FlexTreeUnboxField<TSchema["info"], "notEmpty">> {
		throw rawError("Iterating map values");
	}
	public entries(): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		throw rawError("Iterating map entries");
	}
	public forEach(
		callbackFn: (
			value: FlexTreeUnboxField<TSchema["info"], "notEmpty">,
			key: FieldKey,
			map: FlexTreeMapNode<TSchema>,
		) => void,
		thisArg?: any,
	): void {
		throw rawError("Iterating maps with forEach");
	}
	public set(key: string, value: FlexibleFieldContent<TSchema["info"]> | undefined): void {
		throw rawError("Setting a map entry");
	}
	public delete(key: string): void {
		throw rawError("Deleting a map entry");
	}

	public get asObject(): {
		readonly [P in FieldKey]?: FlexTreeUnboxField<TSchema["info"], "notEmpty">;
	} {
		throw rawError("Converting a map to an object");
	}

	public [Symbol.iterator](): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		return this.entries();
	}

	public override boxedIterator(): IterableIterator<FlexTreeTypedField<TSchema["info"]>> {
		throw rawError("Boxed iteration");
	}
}

/**
 * The implementation of a field node created by {@link createRawNode}.
 */
export class RawFieldNode<TSchema extends FlexFieldNodeSchema>
	extends RawTreeNode<TSchema, InsertableContent>
	implements FlexTreeFieldNode<TSchema>
{
	public get content(): FlexTreeUnboxField<TSchema["info"]> {
		throw rawError("Reading content of an array node");
	}

	public get boxedContent(): FlexTreeTypedField<TSchema["info"]> {
		throw rawError("Reading boxed content of an array node");
	}
}

function rawError(message?: string): Error {
	return new Error(
		`${
			message ?? "Operation"
		} is not supported on content which has not yet been inserted into the tree`,
	);
}
