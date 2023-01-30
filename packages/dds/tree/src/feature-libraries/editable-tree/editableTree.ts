/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Value,
	Anchor,
	FieldKey,
	symbolIsFieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
	FieldSchema,
	LocalFieldKey,
	TreeSchemaIdentifier,
	TreeSchema,
	ValueSchema,
	lookupTreeSchema,
	mapCursorField,
	mapCursorFields,
	CursorLocationType,
	FieldAnchor,
	ITreeCursor,
} from "../../core";
import { brand, fail } from "../../util";
import { FieldKind, Multiplicity } from "../modular-schema";
import { singleMapTreeCursor } from "../mapTreeCursor";
import {
	AdaptingProxyHandler,
	adaptWithProxy,
	getFieldKind,
	getFieldSchema,
	getPrimaryField,
	isPrimitive,
	isPrimitiveValue,
	PrimitiveValue,
	keyIsValidIndex,
	getOwnArrayKeys,
	assertPrimitiveValueType,
	ContextuallyTypedNodeData,
	MarkedArrayLike,
	arrayLikeMarkerSymbol,
	ContextuallyTypedNodeDataObject,
	applyFieldTypesFromContext,
	applyTypesFromContext,
	getPossibleTypes,
} from "./utilities";
import { ProxyContext } from "./editableTreeContext";

/**
 * A symbol for extracting target from {@link EditableTree} proxies.
 * Useful for debugging and testing, but not part of the public API.
 */
export const proxyTargetSymbol: unique symbol = Symbol("editable-tree:proxyTarget");

/**
 * A symbol to get the type of {@link EditableTree} in contexts where string keys are already in use for fields.
 */
export const typeSymbol: unique symbol = Symbol("editable-tree:type");

/**
 * A symbol to get the type name of {@link EditableTree} in contexts where string keys are already in use for fields.
 */
export const typeNameSymbol: unique symbol = Symbol("editable-tree:typeName");

/**
 * A symbol to get and set the value of {@link EditableTree} in contexts where string keys are already in use for fields.
 *
 * Setting the value using the simple assignment operator (`=`) is only supported for {@link PrimitiveValue}s.
 * Concurrently setting the value will follow the "last-write-wins" semantics.
 */
export const valueSymbol: unique symbol = Symbol("editable-tree:value");

/**
 * A symbol to get the index of {@link EditableTree} within its parent field
 * in contexts where string keys are already in use for fields.
 */
export const indexSymbol: unique symbol = Symbol("editable-tree:index");

/**
 * A symbol to get the function, which returns the field of {@link EditableTree} without unwrapping,
 * in contexts where string keys are already in use for fields.
 */
export const getField: unique symbol = Symbol("editable-tree:getField()");

/**
 * A symbol to get the function, which creates a new field of {@link EditableTree},
 * in contexts where string keys are already in use for fields.
 */
export const createField: unique symbol = Symbol("editable-tree:createField()");

/**
 * A symbol to get the function, which replaces a field of {@link EditableTree},
 * in contexts where string keys are already in use for fields.
 */
export const replaceField: unique symbol = Symbol("editable-tree:replaceField()");

/**
 * A tree which can be traversed and edited.
 *
 * When iterating, only visits non-empty fields.
 * To discover empty fields, inspect the schema using {@link typeSymbol}.
 *
 * The tree can be inspected by means of the built-in JS functions e.g.
 * ```
 * const root = context.unwrappedRoot;
 * for (const key of Reflect.ownKeys(root)) { ... }
 * // OR
 * if ("foo" in root) { ... }
 * ```
 * where `context` is a common `EditableTreeContext`.
 *
 * The tree can be edited either by using its symbol-based "toolbox" (e.g. {@link createField})
 * or using a simple assignment operator (see `EditableTreeContext.unwrappedRoot` for more details).
 */
export interface EditableTree extends Iterable<EditableField>, ContextuallyTypedNodeDataObject {
	/**
	 * The name of the node type.
	 */
	readonly [typeNameSymbol]: TreeSchemaIdentifier;

	/**
	 * The type of the node.
	 * If this node is well-formed, it must follow this schema.
	 */
	readonly [typeSymbol]: TreeSchema;

	/**
	 * Value stored on this node.
	 *
	 * Setting the value using the simple assignment operator (`=`) is only supported for {@link PrimitiveValue}s.
	 * Concurrently setting the value will follow the "last-write-wins" semantics.
	 */
	[valueSymbol]: Value;

	/**
	 * Index of this node within its parent field.
	 */
	// TODO: this is a temporary solution.
	// It should be replaced with a more general location symbol like
	// `readonly [location]: EditableTreeUpPath`
	// to cover all the cases, where the code may be lacking information about an origin of the node.
	// See proposed API: https://github.com/microsoft/FluidFramework/pull/12810#issuecomment-1303949419
	readonly [indexSymbol]: number;

	/**
	 * Stores the target for the proxy which implements reading and writing for this node.
	 * The details of this object are implementation details,
	 * but the presence of this symbol can be used to separate EditableTrees from other types.
	 */
	readonly [proxyTargetSymbol]: object;

	/**
	 * Gets the field of this node by its key without unwrapping.
	 */
	[getField](fieldKey: FieldKey): EditableField;

	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * This API exposes content in a way depending on the {@link Multiplicity} of the {@link FieldKind}.
	 * Sequences (including empty ones) are always exposed as {@link EditableField}s,
	 * and everything else is either a single EditableTree or undefined depending on if it's empty.
	 *
	 * It is possible to use this indexed access to delete the field using the `delete` operator and
	 * to set the value of the field or, more precisely, of its existing node using the simple assignment operator (`=`)
	 * if the field is defined as `optional` or `value`, its node {@link isPrimitive} and the value is a {@link PrimitiveValue}.
	 * Concurrently setting the value will follow the "last-write-wins" semantics.
	 *
	 * See `EditableTreeContext.unwrappedRoot` for how to use the simple assignment operator in other cases,
	 * as it works the same way for all children of the tree starting from its root.
	 */
	// TODO: update docs for concurrently deleting the field.
	[key: FieldKey]: UnwrappedEditableField;

	/**
	 * Gets an iterator iterating over the fields of this node.
	 * It reads all fields at once before the iteration starts to get a "snapshot" of this node.
	 * It might be inefficient regarding resources, but avoids situations
	 * when the fields are getting changed while iterating.
	 */
	[Symbol.iterator](): IterableIterator<EditableField>;

	/**
	 * Creates a new field at this node.
	 *
	 * The content of the new field must follow the {@link Multiplicity} of the {@link FieldKind}:
	 * - use a single cursor when creating an `optional` field;
	 * - use array of cursors when creating a `sequence` field;
	 * - use {@link EditableField.insertNodes} instead to create fields of kind `value` as currently
	 * it is not possible to have trees with already populated fields of this kind.
	 *
	 * When creating a field in a concurrent environment,
	 * `optional` fields will be created following the "last-write-wins" semantics,
	 * and for `sequence` fields the content ends up in order of "sequenced-last" to "sequenced-first".
	 */
	[createField](fieldKey: FieldKey, newContent: ITreeCursor | ITreeCursor[]): void;

	/**
	 * Replaces the field of this node.
	 *
	 * The content of the field must follow the {@link Multiplicity} of the {@link FieldKind}:
	 * - use a single cursor when replacing an `optional` or a `value` field;
	 * - use array of cursors when replacing a `sequence` field.
	 *
	 * Use `delete` operator to delete `optional` or `sequence` fields of this node, if any.
	 *
	 * When replacing a field in a concurrent environment,
	 * the following merge semantics will be applied depending on the field multiplicity:
	 * - optional and value fields will be overwritten in a "last-write-wins" fashion,
	 * - for sequence fields, the nodes present in the field on the issuing client will be
	 * deleted and the newContent will be inserted. This means concurrent inserts (including
	 * calls to `replaceField`) can all contribute content. In the future this will likely be
	 * replaced with merge semantics that is more consistent with that of optional and value fields.
	 */
	[replaceField](fieldKey: FieldKey, newContent: ITreeCursor | ITreeCursor[]): void;
}

/**
 * EditableTree,
 * but with any type that `isPrimitive` unwrapped into the value if that value is a {@link PrimitiveValue}.
 */
export type EditableTreeOrPrimitive = EditableTree | PrimitiveValue;

/**
 * EditableTree, but with these cases of unwrapping:
 * - primitives are unwrapped. See {@link EditableTreeOrPrimitive}.
 * - nodes with PrimaryField (see `getPrimaryField`) are unwrapped to {@link EditableField}s.
 * - fields are unwrapped based on their schema's multiplicity. See {@link UnwrappedEditableField}.
 */
export type UnwrappedEditableTree = EditableTreeOrPrimitive | EditableField;

/**
 * Unwrapped field.
 * Non-sequence multiplicities are unwrapped to the child tree or `undefined` if there is none.
 * Sequence multiplicities are handled with {@link EditableField}.
 * See {@link UnwrappedEditableTree} for how the children themselves are unwrapped.
 */
export type UnwrappedEditableField = UnwrappedEditableTree | undefined | EditableField;

/**
 * A field of an {@link EditableTree} as an array-like sequence of unwrapped nodes (see {@link UnwrappedEditableTree}).
 *
 * The number of nodes depends on a field's multiplicity.
 * When iterating, the nodes are read at once. Use index access to read the nodes "lazily".
 * Use `getNode` to get a node without unwrapping.
 *
 * It is possible to create/replace a node or to set its value by using the simple assignment operator (`=`)
 * and providing an input data as a {@link ContextuallyTypedNodeData}.
 * See `EditableTreeContext.unwrappedRoot` for more details, as it works the same way for all
 * children of the tree starting from its root.
 *
 * It is forbidden to delete the node using the `delete` operator, use the `deleteNodes()` method instead.
 */
export interface EditableField
	// Here, the `UnwrappedEditableTree | ContextuallyTypedNodeData` union is used
	// due to a lacking support for variant accessors for index signatures in TypeScript,
	// see https://github.com/microsoft/TypeScript/issues/43826.
	// Otherwise it would be better to have a setter accepting the `ContextuallyTypedNodeData`
	// and a getter returning the `UnwrappedEditableTree` for the numeric indexed access
	// similar to, e.g., the getter and setter of the `EditableTreeContext.root`.
	// Thus, in most cases this must be understood as:
	// - "returns `UnwrappedEditableTree` when accessing the nodes by their indices" and
	// - "can also accept `ContextuallyTypedNodeData` when setting the nodes by their indices".
	// TODO: replace the numeric indexed access with getters and setters if possible.
	extends MarkedArrayLike<UnwrappedEditableTree | ContextuallyTypedNodeData> {
	/**
	 * The `FieldSchema` of this field.
	 */
	readonly fieldSchema: FieldSchema;

	/**
	 * The `FieldKey` of this field.
	 */
	readonly fieldKey: FieldKey;

	/**
	 * The type name of the parent node.
	 *
	 * It is defined iff this field is the primary field of its parent node (see note on `EmptyKey`).
	 */
	readonly primaryType?: TreeSchemaIdentifier;

	/**
	 * Stores the target for the proxy which implements reading and writing for this sequence field.
	 * The details of this object are implementation details,
	 * but the presence of this symbol can be used to separate EditableTrees from other types.
	 */
	readonly [proxyTargetSymbol]: object;

	/**
	 * Gets a node of this field by its index without unwrapping.
	 * Note that the node must exists at the given index.
	 */
	getNode(index: number): EditableTree;

	/**
	 * Inserts new nodes into this field.
	 */
	insertNodes(index: number, newContent: ITreeCursor | ITreeCursor[]): void;

	/**
	 * Sequentially deletes the nodes from this field.
	 *
	 * @param index - the index of the first node to be deleted. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be deleted. If not provided, deletes all nodes
	 * starting from the index and up to the length of the field.
	 */
	deleteNodes(index: number, count?: number): void;

	/**
	 * Sequentially replaces the nodes of this field.
	 *
	 * @param index - the index of the first node to be replaced. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be replaced. If not provided, replaces all nodes
	 * starting from the index and up to the length of the field.
	 *
	 * Note that, if multiple clients concurrently call replace on a sequence field,
	 * all the insertions will be preserved.
	 */
	replaceNodes(index: number, newContent: ITreeCursor | ITreeCursor[], count?: number): void;
}

/**
 * This is a base class for `NodeProxyTarget` and `FieldProxyTarget`, which uniformly handles cursors and anchors.
 */
export abstract class ProxyTarget<T extends Anchor | FieldAnchor> {
	private readonly lazyCursor: ITreeSubscriptionCursor;
	private anchor?: T;

	constructor(public readonly context: ProxyContext, cursor: ITreeSubscriptionCursor) {
		this.lazyCursor = cursor.fork();
		context.withCursors.add(this);
	}

	public free(): void {
		this.lazyCursor.free();
		this.context.withCursors.delete(this);
		if (this.anchor !== undefined) {
			this.forgetAnchor(this.anchor);
			this.context.withAnchors.delete(this);
			this.anchor = undefined;
		}
	}

	public getAnchor(): T {
		if (this.anchor === undefined) {
			this.anchor = this.buildAnchorFromCursor(this.lazyCursor);
			this.context.withAnchors.add(this);
		}
		return this.anchor;
	}

	public prepareForEdit(): void {
		this.getAnchor();
		this.lazyCursor.clear();
		this.context.withCursors.delete(this);
	}

	public get cursor(): ITreeSubscriptionCursor {
		if (this.lazyCursor.state === ITreeSubscriptionCursorState.Cleared) {
			assert(
				this.anchor !== undefined,
				0x3c3 /* EditableTree should have an anchor if it does not have a cursor */,
			);
			const result = this.tryMoveCursorToAnchor(this.anchor, this.lazyCursor);
			assert(
				result === TreeNavigationResult.Ok,
				0x3c4 /* It is invalid to access an EditableTree node which no longer exists */,
			);
			this.context.withCursors.add(this);
		}
		return this.lazyCursor;
	}

	abstract buildAnchorFromCursor(cursor: ITreeSubscriptionCursor): T;

	abstract tryMoveCursorToAnchor(
		anchor: T,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	abstract forgetAnchor(anchor: T): void;
}

function isFieldProxyTarget(target: ProxyTarget<Anchor | FieldAnchor>): target is FieldProxyTarget {
	return target instanceof FieldProxyTarget;
}

function isNodeProxyTarget(target: ProxyTarget<Anchor | FieldAnchor>): target is NodeProxyTarget {
	return target instanceof NodeProxyTarget;
}

/**
 * A Proxy target, which together with a `nodeProxyHandler` implements a basic access to
 * the fields of {@link EditableTree} by means of the cursors.
 */
export class NodeProxyTarget extends ProxyTarget<Anchor> {
	constructor(context: ProxyContext, cursor: ITreeSubscriptionCursor) {
		assert(cursor.mode === CursorLocationType.Nodes, 0x44c /* must be in nodes mode */);
		super(context, cursor);
	}

	buildAnchorFromCursor(cursor: ITreeSubscriptionCursor): Anchor {
		return cursor.buildAnchor();
	}

	tryMoveCursorToAnchor(anchor: Anchor, cursor: ITreeSubscriptionCursor): TreeNavigationResult {
		return this.context.forest.tryMoveCursorToNode(anchor, cursor);
	}

	forgetAnchor(anchor: Anchor): void {
		this.context.forest.anchors.forget(anchor);
	}

	get typeName(): TreeSchemaIdentifier {
		return this.cursor.type;
	}

	get type(): TreeSchema {
		return lookupTreeSchema(this.context.schema, this.typeName);
	}

	get value(): Value {
		return this.cursor.value;
	}

	set value(value: Value) {
		assert(isPrimitive(this.type), 0x44d /* Cannot set a value of a non-primitive field */);
		assertPrimitiveValueType(value, this.type);
		const path = this.cursor.getPath();
		assert(path !== undefined, 0x44e /* Cannot locate a path to set a value of the node */);
		this.context.setNodeValue(path, value);
	}

	get currentIndex(): number {
		return this.cursor.fieldIndex;
	}

	public lookupFieldKind(field: FieldKey): FieldKind {
		return getFieldKind(this.getFieldSchema(field));
	}

	public getFieldSchema(field: FieldKey): FieldSchema {
		return getFieldSchema(field, this.context.schema, this.type);
	}

	public getFieldKeys(): FieldKey[] {
		return mapCursorFields(this.cursor, (c) => c.getFieldKey());
	}

	public has(field: FieldKey): boolean {
		// Make fields present only if non-empty.
		this.cursor.enterField(field);
		const length = this.cursor.getFieldLength();
		this.cursor.exitField();
		return length !== 0;
	}

	/**
	 * @returns the key, if any, of the primary array field.
	 */
	public getPrimaryArrayKey(): { key: LocalFieldKey; schema: FieldSchema } | undefined {
		const primary = getPrimaryField(this.type);
		if (primary === undefined) {
			return undefined;
		}
		const kind = getFieldKind(primary.schema);
		if (kind.multiplicity === Multiplicity.Sequence) {
			// TODO: this could have issues if there are non-primary keys
			// that can collide with the array APIs (length or integers).
			return primary;
		}
		return undefined;
	}

	public proxifyField(field: FieldKey, unwrap: false): EditableField;
	public proxifyField(field: FieldKey, unwrap?: true): UnwrappedEditableField;
	public proxifyField(field: FieldKey, unwrap = true): UnwrappedEditableField | EditableField {
		const fieldSchema = this.getFieldSchema(field);
		this.cursor.enterField(field);
		const proxifiedField = proxifyField(this.context, fieldSchema, this.cursor, unwrap);
		this.cursor.exitField();
		return proxifiedField;
	}

	public getField(fieldKey: FieldKey): EditableField {
		return this.proxifyField(fieldKey, false);
	}

	[Symbol.iterator](): IterableIterator<EditableField> {
		return this.getFieldKeys()
			.map((fieldKey) => this.proxifyField(fieldKey, false))
			.values();
	}

	public createField(fieldKey: FieldKey, newContent: ITreeCursor | ITreeCursor[]): void {
		assert(!this.has(fieldKey), 0x44f /* The field already exists. */);
		const fieldKind = this.lookupFieldKind(fieldKey);
		const path = this.cursor.getPath();
		switch (fieldKind.multiplicity) {
			case Multiplicity.Optional: {
				assert(
					!Array.isArray(newContent),
					0x450 /* Use single cursor to create the optional field */,
				);
				this.context.setOptionalField(path, fieldKey, newContent, true);
				break;
			}
			case Multiplicity.Sequence: {
				this.context.insertNodes(path, fieldKey, 0, newContent);
				break;
			}
			case Multiplicity.Value:
				fail("It is invalid to create fields of kind `value` as they should always exist.");
			default:
				fail("`Forbidden` fields may not be created.");
		}
	}

	public deleteField(fieldKey: FieldKey): void {
		const fieldKind = this.lookupFieldKind(fieldKey);
		const path = this.cursor.getPath();
		switch (fieldKind.multiplicity) {
			case Multiplicity.Optional: {
				this.context.setOptionalField(path, fieldKey, undefined, false);
				break;
			}
			case Multiplicity.Sequence: {
				this.cursor.enterField(fieldKey);
				const length = this.cursor.getFieldLength();
				this.cursor.exitField();
				this.context.deleteNodes(path, fieldKey, 0, length);
				break;
			}
			case Multiplicity.Value:
				fail("Fields of kind `value` may not be deleted.");
			default:
				fail("`Forbidden` fields may not be deleted.");
		}
	}

	public replaceField(fieldKey: FieldKey, newContent: ITreeCursor | ITreeCursor[]): void {
		const fieldKind = this.lookupFieldKind(fieldKey);
		const path = this.cursor.getPath();
		switch (fieldKind.multiplicity) {
			case Multiplicity.Optional: {
				assert(
					!Array.isArray(newContent),
					0x4cd /* It is invalid to replace the optional field using the array data. */,
				);
				this.context.setOptionalField(path, fieldKey, newContent, !this.has(fieldKey));
				break;
			}
			case Multiplicity.Sequence: {
				this.cursor.enterField(fieldKey);
				const length = this.cursor.getFieldLength();
				this.cursor.exitField();
				/**
				 * `replaceNodes` has different merge semantics than the `replaceField` would ideally offer:
				 * `replaceNodes` should not overwrite concurrently inserted content while `replaceField` should.
				 * We currently use `replaceNodes` here because the low-level editing API
				 * for the desired `replaceField` semantics is not yet avaialble.
				 */
				// TODO: update implementation once the low-level editing API is available.
				this.context.replaceNodes(path, fieldKey, 0, length, newContent);
				break;
			}
			case Multiplicity.Value: {
				assert(
					!Array.isArray(newContent),
					0x4ce /* It is invalid to replace the value field using the array data. */,
				);
				this.context.setValueField(path, fieldKey, newContent);
				break;
			}
			default:
				fail("`Forbidden` fields may not be replaced as they never exist.");
		}
	}
}

/**
 * A Proxy handler together with a {@link NodeProxyTarget} implements a basic read/write access to the Forest
 * by means of the cursors.
 */
const nodeProxyHandler: AdaptingProxyHandler<NodeProxyTarget, EditableTree> = {
	get: (target: NodeProxyTarget, key: string | symbol): unknown => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			// All string keys are fields
			return target.proxifyField(brand(key));
		}
		// utility symbols
		switch (key) {
			case typeSymbol:
				return target.type;
			case typeNameSymbol:
				return target.typeName;
			case valueSymbol:
				return target.value;
			case indexSymbol:
				return target.currentIndex;
			case proxyTargetSymbol:
				return target;
			case Symbol.iterator:
				return target[Symbol.iterator].bind(target);
			case getField:
				return target.getField.bind(target);
			case createField:
				return target.createField.bind(target);
			case replaceField:
				return target.replaceField.bind(target);
			default:
				return undefined;
		}
	},
	set: (
		target: NodeProxyTarget,
		key: string | symbol,
		value: ContextuallyTypedNodeData,
		receiver: NodeProxyTarget,
	): boolean => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			const fieldKey: FieldKey = brand(key);
			const fieldSchema = target.getFieldSchema(fieldKey);
			const multiplicity = target.lookupFieldKind(fieldKey).multiplicity;
			if (target.has(fieldKey) && isPrimitiveValue(value)) {
				assert(
					multiplicity === Multiplicity.Value || multiplicity === Multiplicity.Optional,
					0x4cf /* single value provided for an unsupported field */,
				);
				const possibleTypes = getPossibleTypes(
					target.context.schema,
					fieldSchema.types,
					value,
				);
				if (possibleTypes.length > 1) {
					const field = target.proxifyField(fieldKey, false);
					const node = field.getNode(0);
					assertPrimitiveValueType(value, node[typeSymbol]);
					node[valueSymbol] = value;
					return true;
				}
			}
			const content = applyFieldTypesFromContext(target.context.schema, fieldSchema, value);
			const cursors = content.map(singleMapTreeCursor);
			// This unconditionally uses `replaceField`, which differs from `createField`
			// only for sequence fields while using `insertNodes` instead of `replaceNodes`
			// (plus some difference in assertions, which is ignored here for a sake of a better
			// consistency with the low-level editing API).
			// Since `insertNodes` and `replaceNodes` have same merge semantics with `replaceNodes`
			// being a bit more general purpose function, it's ok to just use that.
			if (multiplicity !== Multiplicity.Sequence) {
				target.replaceField(fieldKey, cursors[0]);
			} else {
				target.replaceField(fieldKey, cursors);
			}
			return true;
		}
		if (key === valueSymbol) {
			target.value = value;
			return true;
		}
		return false;
	},
	deleteProperty: (target: NodeProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			const fieldKey: FieldKey = brand(key);
			target.deleteField(fieldKey);
			return true;
		}
		return false;
	},
	// Include documented symbols (except value when value is undefined) and all non-empty fields.
	has: (target: NodeProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			return target.has(brand(key));
		}
		// utility symbols
		switch (key) {
			case proxyTargetSymbol:
			case typeSymbol:
			case typeNameSymbol:
			case indexSymbol:
			case Symbol.iterator:
			case getField:
			case createField:
			case replaceField:
				return true;
			case valueSymbol:
				// Could do `target.value !== ValueSchema.Nothing`
				// instead if values which could be modified should report as existing.
				return target.value !== undefined;
			default:
				return false;
		}
	},
	// Includes all non-empty fields, which are the enumerable fields.
	ownKeys: (target: NodeProxyTarget): FieldKey[] => {
		return target.getFieldKeys();
	},
	getOwnPropertyDescriptor: (
		target: NodeProxyTarget,
		key: string | symbol,
	): PropertyDescriptor | undefined => {
		// We generally don't want to allow users of the proxy to reconfigure all the properties,
		// but it is an TypeError to return non-configurable for properties that do not exist on target,
		// so they must return true.

		if ((typeof key === "string" || symbolIsFieldKey(key)) && target.has(brand(key))) {
			const unwrappedField = target.proxifyField(brand(key));
			return {
				configurable: true,
				enumerable: true,
				value: unwrappedField,
				writable: isPrimitiveValue(unwrappedField),
			};
		}
		// utility symbols
		switch (key) {
			case proxyTargetSymbol:
				return { configurable: true, enumerable: false, value: target, writable: false };
			case typeSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.type,
					writable: false,
				};
			case typeNameSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.typeName,
					writable: false,
				};
			case valueSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.value,
					writable: false,
				};
			case indexSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.currentIndex,
					writable: false,
				};
			case Symbol.iterator:
				return {
					configurable: true,
					enumerable: false,
					value: target[Symbol.iterator].bind(target),
					writable: false,
				};
			case getField:
				return {
					configurable: true,
					enumerable: false,
					value: target.getField.bind(target),
					writable: false,
				};
			case createField:
				return {
					configurable: true,
					enumerable: false,
					value: target.createField.bind(target),
					writable: false,
				};
			case replaceField:
				return {
					configurable: true,
					enumerable: false,
					value: target.replaceField.bind(target),
					writable: false,
				};
			default:
				return undefined;
		}
	},
};

/**
 * A Proxy target, which together with a `fieldProxyHandler` implements a basic access to
 * the nodes of {@link EditableField} by means of the cursors.
 */
export class FieldProxyTarget extends ProxyTarget<FieldAnchor> implements EditableField {
	public readonly fieldKey: FieldKey;
	public readonly fieldSchema: FieldSchema;
	public readonly primaryType?: TreeSchemaIdentifier;
	public readonly [arrayLikeMarkerSymbol]: true;

	constructor(
		context: ProxyContext,
		fieldSchema: FieldSchema,
		cursor: ITreeSubscriptionCursor,
		primaryType?: TreeSchemaIdentifier,
	) {
		assert(cursor.mode === CursorLocationType.Fields, 0x453 /* must be in fields mode */);
		super(context, cursor);
		this.fieldKey = cursor.getFieldKey();
		this.primaryType = primaryType;
		this.fieldSchema = fieldSchema;
		this[arrayLikeMarkerSymbol] = true;
	}

	get [proxyTargetSymbol](): FieldProxyTarget {
		return this;
	}

	buildAnchorFromCursor(cursor: ITreeSubscriptionCursor): FieldAnchor {
		return cursor.buildFieldAnchor();
	}

	tryMoveCursorToAnchor(
		anchor: FieldAnchor,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.forest.tryMoveCursorToField(anchor, cursor);
	}

	forgetAnchor(anchor: FieldAnchor): void {
		if (anchor.parent === undefined) return;
		this.context.forest.anchors.forget(anchor.parent);
	}

	[index: number]: UnwrappedEditableTree;

	public get length(): number {
		return this.cursor.getFieldLength();
	}

	/**
	 * Returns a node (unwrapped by default, see {@link UnwrappedEditableTree}) by its index.
	 */
	public proxifyNode(index: number, unwrap: false): EditableTree;
	public proxifyNode(index: number, unwrap?: true): UnwrappedEditableTree;
	public proxifyNode(index: number, unwrap = true): UnwrappedEditableTree | EditableTree {
		this.cursor.enterNode(index);
		const target = new NodeProxyTarget(this.context, this.cursor);
		this.cursor.exitNode();
		return inProxyOrUnwrap(target, unwrap);
	}

	/**
	 * Gets a node by its index without unwrapping.
	 */
	public getNode(index: number): EditableTree {
		assert(
			keyIsValidIndex(index, this.length),
			0x454 /* A child node must exist at index to get it without unwrapping. */,
		);
		return this.proxifyNode(index, false);
	}

	/**
	 * Gets array of unwrapped nodes.
	 */
	private asArray(): UnwrappedEditableTree[] {
		return mapCursorField(this.cursor, (c) =>
			inProxyOrUnwrap(new NodeProxyTarget(this.context, c), true),
		);
	}

	[Symbol.iterator](): IterableIterator<UnwrappedEditableTree> {
		return this.asArray().values();
	}

	public insertNodes(index: number, newContent: ITreeCursor | ITreeCursor[]): void {
		const fieldKind = getFieldKind(this.fieldSchema);
		// TODO: currently for all field kinds the nodes can be created by editor using `sequenceField.insert()`.
		// Uncomment the next line and remove non-sequence related code when the editor will become more schema-aware.
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		if (fieldKind.multiplicity !== Multiplicity.Sequence) {
			assert(
				this.length === 0 && (!Array.isArray(newContent) || newContent.length <= 1),
				0x455 /* A non-sequence field cannot have more than one node. */,
			);
		}
		assert(
			keyIsValidIndex(index, this.length + 1),
			0x456 /* Index must be less than or equal to length. */,
		);
		const fieldPath = this.cursor.getFieldPath();
		this.context.insertNodes(fieldPath.parent, fieldPath.field, index, newContent);
	}

	public deleteNodes(index: number, count?: number): void {
		// TODO: currently for all field kinds the nodes can be deleted by editor using `sequenceField.delete()`.
		// Uncomment when the editor will become more schema-aware.
		// const fieldKind = getFieldKind(this.fieldSchema);
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		assert(
			this.length === 0 || keyIsValidIndex(index, this.length),
			0x457 /* Index must be less than length. */,
		);
		if (count !== undefined) assert(count >= 0, 0x458 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const _count = count === undefined || count > maxCount ? maxCount : count;
		const fieldPath = this.cursor.getFieldPath();
		this.context.deleteNodes(fieldPath.parent, fieldPath.field, index, _count);
	}

	public replaceNodes(
		index: number,
		newContent: ITreeCursor | ITreeCursor[],
		count?: number,
	): void {
		const fieldKind = getFieldKind(this.fieldSchema);
		// TODO: currently for all field kinds the nodes can be created by editor using `sequenceField.insert()`.
		// Uncomment the next line and remove non-sequence related code when the editor will become more schema-aware.
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		if (fieldKind.multiplicity !== Multiplicity.Sequence) {
			assert(
				this.length <= 1 && (!Array.isArray(newContent) || newContent.length <= 1),
				0x4d0 /* A non-sequence field cannot have more than one node. */,
			);
		}
		assert(
			(this.length === 0 && index === 0) || keyIsValidIndex(index, this.length),
			0x4d1 /* Index must be less than length or, if the field is empty, be 0. */,
		);
		if (count !== undefined) assert(count >= 0, 0x4d2 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const _count = count === undefined || count > maxCount ? maxCount : count;
		const fieldPath = this.cursor.getFieldPath();
		this.context.replaceNodes(fieldPath.parent, fieldPath.field, index, _count, newContent);
	}
}

const editableFieldPropertySetWithoutLength = new Set<string>([
	"fieldKey",
	"fieldSchema",
	"primaryType",
]);
/**
 * The set of `EditableField` properties exposed by `fieldProxyHandler`.
 * Any other properties are considered to be non-existing.
 */
const editableFieldPropertySet = new Set<string>([
	"length",
	...editableFieldPropertySetWithoutLength,
]);

/**
 * Returns a Proxy handler, which together with a {@link FieldProxyTarget} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
const fieldProxyHandler: AdaptingProxyHandler<FieldProxyTarget, EditableField> = {
	get: (target: FieldProxyTarget, key: string | symbol, receiver: object): unknown => {
		if (typeof key === "string") {
			if (editableFieldPropertySet.has(key)) {
				return Reflect.get(target, key);
			} else if (keyIsValidIndex(key, target.length)) {
				return target.proxifyNode(Number(key));
			}
			// This maps the methods of the `EditableField` to their implementation in the `FieldProxyTarget`.
			// Expected are only the methods declared in the `EditableField` interface,
			// as only those are visible for the users of the public API.
			// Such implicit delegation is chosen for a future array implementation in case it will be needed.
			const reflected = Reflect.get(target, key);
			if (typeof reflected === "function") {
				return function (...args: unknown[]): unknown {
					return Reflect.apply(reflected, target, args);
				};
			}
			return undefined;
		}
		switch (key) {
			case proxyTargetSymbol:
				return target;
			case Symbol.iterator:
				return target[Symbol.iterator].bind(target);
			case arrayLikeMarkerSymbol:
				return true;
			default:
		}
		return undefined;
	},
	set: (
		target: FieldProxyTarget,
		key: string,
		value: ContextuallyTypedNodeData,
		receiver: unknown,
	): boolean => {
		const cursor = singleMapTreeCursor(
			applyTypesFromContext(target.context.schema, target.fieldSchema.types, value),
		);
		// This is just a cheap way to check if there might be a node at the given index.
		// An implementation of the target methods holds all relevant key assertions.
		// TODO: maybe refactor this to add a real node existence check if desired,
		// but it might be costly regarding performance.
		if (keyIsValidIndex(key, target.length)) {
			target.replaceNodes(Number(key), cursor, 1);
		} else {
			target.insertNodes(Number(key), cursor);
		}
		return true;
	},
	deleteProperty: (target: FieldProxyTarget, key: string): boolean => {
		throw new Error("Not supported. Use `deleteNodes()` instead");
	},
	// Include documented symbols and all non-empty fields.
	has: (target: FieldProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "symbol") {
			switch (key) {
				case Symbol.iterator:
				case proxyTargetSymbol:
				case arrayLikeMarkerSymbol:
					return true;
				default:
			}
		} else {
			if (keyIsValidIndex(key, target.length) || editableFieldPropertySet.has(key)) {
				return true;
			}
		}
		return false;
	},
	ownKeys: (target: FieldProxyTarget): ArrayLike<keyof EditableField> => {
		// This includes 'length' property.
		const keys: string[] = getOwnArrayKeys(target.length);
		keys.push(...editableFieldPropertySetWithoutLength);
		return keys as ArrayLike<keyof EditableField>;
	},
	getOwnPropertyDescriptor: (
		target: FieldProxyTarget,
		key: string | symbol,
	): PropertyDescriptor | undefined => {
		// We generally don't want to allow users of the proxy to reconfigure all the properties,
		// but it is a TypeError to return non-configurable for properties that do not exist on target,
		// so they must return true.
		if (typeof key === "symbol") {
			switch (key) {
				case proxyTargetSymbol:
					return {
						configurable: true,
						enumerable: false,
						value: target,
						writable: false,
					};
				case Symbol.iterator:
					return {
						configurable: true,
						enumerable: false,
						value: target[Symbol.iterator].bind(target),
						writable: false,
					};
				default:
			}
		} else {
			if (editableFieldPropertySet.has(key)) {
				return {
					configurable: true,
					enumerable: false,
					value: Reflect.get(target, key),
					writable: false,
				};
			} else if (keyIsValidIndex(key, target.length)) {
				return {
					configurable: true,
					enumerable: true,
					value: target.proxifyNode(Number(key)),
					writable: true,
				};
			}
		}
		return undefined;
	},
};

/**
 * See {@link UnwrappedEditableTree} for documentation on what unwrapping this performs.
 */
function inProxyOrUnwrap(
	target: NodeProxyTarget | FieldProxyTarget,
	unwrap: boolean,
): UnwrappedEditableTree {
	// Unwrap primitives or nodes having a primary field. Sequences unwrap nodes on their own.
	if (unwrap && !isFieldProxyTarget(target)) {
		const { type: nodeType, typeName: nodeTypeName } = target;
		if (isPrimitive(nodeType)) {
			const nodeValue = target.cursor.value;
			if (isPrimitiveValue(nodeValue)) {
				return nodeValue;
			}
			assert(
				nodeType.value === ValueSchema.Serializable,
				0x3c7 /* `undefined` values not allowed for primitive fields */,
			);
		}
		const primary = target.getPrimaryArrayKey();
		if (primary !== undefined) {
			target.cursor.enterField(primary.key);
			const primarySequence = new FieldProxyTarget(
				target.context,
				primary.schema,
				target.cursor,
				nodeTypeName,
			);
			// Even though the target gets "substituted" by the FieldProxyTarget and not used afterwards,
			// its cursor still must follow the "node" mode, as the target is cached in the context,
			// where an anchor for this node must be built by the cursor within `prepareForEdit`.
			target.cursor.exitField();
			return adaptWithProxy(primarySequence, fieldProxyHandler);
		}
	}
	return isFieldProxyTarget(target)
		? adaptWithProxy(target, fieldProxyHandler)
		: adaptWithProxy(target, nodeProxyHandler);
}

/**
 * @param context - the common context of the field.
 * @param fieldSchema - the FieldSchema of the field.
 * @param cursor - the cursor, which must point to the field being proxified.
 * @param unwrap - if true, the field is unwrapped (see {@link UnwrappedEditableField}),
 * otherwise always returns the field as {@link EditableField}.
 */
export function proxifyField(
	context: ProxyContext,
	fieldSchema: FieldSchema,
	cursor: ITreeSubscriptionCursor,
	unwrap: false,
): EditableField;
export function proxifyField(
	context: ProxyContext,
	fieldSchema: FieldSchema,
	cursor: ITreeSubscriptionCursor,
	unwrap: true,
): UnwrappedEditableField;
// ts cannot resolve boolean without this overload
export function proxifyField(
	context: ProxyContext,
	fieldSchema: FieldSchema,
	cursor: ITreeSubscriptionCursor,
	unwrap: boolean,
): UnwrappedEditableField | EditableField;
export function proxifyField(
	context: ProxyContext,
	fieldSchema: FieldSchema,
	cursor: ITreeSubscriptionCursor,
	unwrap: boolean = true,
): UnwrappedEditableField | EditableField {
	if (!unwrap) {
		const targetSequence = new FieldProxyTarget(context, fieldSchema, cursor);
		return inProxyOrUnwrap(targetSequence, unwrap);
	}
	const fieldKind = getFieldKind(fieldSchema);
	if (fieldKind.multiplicity === Multiplicity.Sequence) {
		const targetSequence = new FieldProxyTarget(context, fieldSchema, cursor);
		return inProxyOrUnwrap(targetSequence, unwrap);
	}
	const length = cursor.getFieldLength();
	assert(length <= 1, 0x3c8 /* invalid non sequence */);
	if (length === 1) {
		cursor.enterNode(0);
		const target = new NodeProxyTarget(context, cursor);
		const proxifiedNode = inProxyOrUnwrap(target, unwrap);
		cursor.exitNode();
		return proxifiedNode;
	}
	return undefined;
}

/**
 * Checks the type of an UnwrappedEditableField.
 */
export function isUnwrappedNode(field: UnwrappedEditableField): field is EditableTree {
	return (
		typeof field === "object" &&
		isNodeProxyTarget(field[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>)
	);
}

/**
 * Checks the type of an UnwrappedEditableField.
 */
export function isEditableField(field: UnwrappedEditableField): field is EditableField {
	return (
		typeof field === "object" &&
		isFieldProxyTarget(field[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>)
	);
}
