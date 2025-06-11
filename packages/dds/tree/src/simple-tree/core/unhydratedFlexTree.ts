/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import { assert, oob, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type AnchorEvents,
	dummyRoot,
	type FieldKey,
	type FieldKindIdentifier,
	type ITreeCursorSynchronous,
	type NodeData,
	type NormalizedFieldUpPath,
	type SchemaPolicy,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeValue,
	type Value,
} from "../../core/index.js";
import {
	type FlexTreeContext,
	FlexTreeEntityKind,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type FlexTreeTypedField,
	type FlexTreeUnknownUnboxed,
	flexTreeMarker,
	indexForAt,
	type FlexTreeHydratedContext,
	type FlexFieldKind,
	FieldKinds,
	type SequenceFieldEditBuilder,
	cursorForMapTreeNode,
	type OptionalFieldEditBuilder,
	type ValueFieldEditBuilder,
	type FlexibleNodeContent,
	type FlexTreeHydratedContextMinimal,
	type FlexibleFieldContent,
	type MapTreeFieldViewGeneric,
	type MapTreeNodeViewGeneric,
	type HydratedFlexTreeNode,
	cursorForMapTreeField,
	type MinimalFieldMap,
} from "../../feature-libraries/index.js";
import { brand, filterIterable, getOrCreate, mapIterable } from "../../util/index.js";

import type { Context } from "./context.js";
import type { ContextualFieldProvider } from "../schemaTypes.js";
import type { TreeNode } from "./treeNode.js";

interface UnhydratedTreeSequenceFieldEditBuilder
	extends SequenceFieldEditBuilder<FlexibleFieldContent, UnhydratedFlexTreeNode[]> {}

type UnhydratedFlexTreeNodeEvents = Pick<AnchorEvents, "childrenChangedAfterBatch">;

/** A node's parent field and its index in that field */
type LocationInField = FlexTreeNode["parentField"];

/**
 * The {@link Unhydrated} implementation of {@link FlexTreeNode}.
 */
export class UnhydratedFlexTreeNode
	implements FlexTreeNode, MapTreeNodeViewGeneric<UnhydratedFlexTreeNode>
{
	public isHydrated(): this is HydratedFlexTreeNode {
		return false;
	}

	private location = unparentedLocation;

	public get storedSchema(): TreeNodeStoredSchema {
		return (
			this.context.schema.nodeSchema.get(this.data.type) ?? fail(0xb46 /* missing schema */)
		);
	}

	/**
	 * Cache storing the {@link TreeNode} for this inner node.
	 * @remarks
	 * When creating a `TreeNode` for this `UnhydratedFlexTreeNode`, cache the `TreeNode` in this property.
	 * Currently this is done by {@link TreeNodeKernel}.
	 *
	 * See {@link getOrCreateNodeFromInnerNode} how to get the `TreeNode`, even if not already created, regardless of hydration status.
	 */
	public treeNode: TreeNode | undefined;

	public readonly [flexTreeMarker] = FlexTreeEntityKind.Node as const;

	private readonly _events = createEmitter<UnhydratedFlexTreeNodeEvents>();
	public get events(): Listenable<UnhydratedFlexTreeNodeEvents> {
		return this._events;
	}

	public get context(): FlexTreeContext {
		return this.simpleContext.flexContext;
	}

	/**
	 * Create a new UnhydratedFlexTreeNode.
	 */
	public constructor(
		/**
		 * The {@link NodeData} for this node.
		 */
		public readonly data: NodeData,
		/**
		 * All {@link UnhydratedFlexTreeField} for this node that have been created so far.
		 * @remarks
		 * This includes all non-empty fields, but also any empty fields which have been previously requested.
		 */
		private readonly fieldsAll: Map<FieldKey, UnhydratedFlexTreeField>,
		/**
		 * The {@link Context} for this node.
		 * @remarks
		 * Provides access to all schema reachable from this node.
		 * See {@link getUnhydratedContext}.
		 */
		public readonly simpleContext: Context,
	) {
		for (const [_key, field] of this.fieldsAll) {
			field.parent = this;
		}
	}

	/**
	 * The non-empty fields on this node.
	 * @remarks
	 * This is needed to implement {@link MapTreeNodeViewGeneric.fields}, which must omit empty fields.
	 * Due to having to detect if a field is empty, this forces the evaluation of any pending defaults in the fields.
	 * Use {@link allFieldsLazy} to avoid evaluating pending defaults.
	 */
	public readonly fields: MinimalFieldMap<UnhydratedFlexTreeField> = {
		get: (key: FieldKey): UnhydratedFlexTreeField | undefined => this.tryGetField(key),
		[Symbol.iterator]: (): IterableIterator<[FieldKey, UnhydratedFlexTreeField]> =>
			filterIterable(this.fieldsAll, ([, field]) => field.length > 0),
	};

	public [Symbol.iterator](): IterableIterator<UnhydratedFlexTreeField> {
		return mapIterable(this.fields, ([, field]) => field)[Symbol.iterator]();
	}

	/**
	 * Gets all fields, without filtering out empty ones.
	 * @remarks
	 * This avoids forcing the evaluating of pending defaults in the fields, and also saves a copy on access.
	 */
	public get allFieldsLazy(): ReadonlyMap<FieldKey, UnhydratedFlexTreeField> {
		return this.fieldsAll;
	}

	public get type(): TreeNodeSchemaIdentifier {
		return this.data.type;
	}

	private getOrCreateField(key: FieldKey): UnhydratedFlexTreeField {
		return getOrCreate(this.fieldsAll, key, () => {
			const stored = this.storedSchema.getFieldSchema(key).kind;
			const field = createField(this.context, stored, key, []);
			field.parent = this;
			return field;
		});
	}

	/**
	 * Set this node's parentage (see {@link FlexTreeNode.parentField}).
	 * @remarks The node may be given a parent if it has none, or may have its parent removed (by passing `undefined`).
	 * However, a node with a parent may not be directly re-assigned a different parent.
	 * That likely indicates either an attempted multi-parenting or an attempt to "move" the node, neither of which are supported.
	 * Removing a node's parent twice in a row is also not supported, as it likely indicates a bug.
	 */
	public adoptBy(parent: undefined): void;
	public adoptBy(parent: UnhydratedFlexTreeField, index: number): void;
	public adoptBy(parent: UnhydratedFlexTreeField | undefined, index?: number): void {
		if (parent !== undefined) {
			assert(index !== undefined, 0xa08 /* Expected index */);
			if (this.location !== unparentedLocation) {
				throw new UsageError("A node may not be in more than one place in the tree");
			}
			let unhydratedNode: UnhydratedFlexTreeNode | undefined = parent.parent;
			while (unhydratedNode !== undefined) {
				if (unhydratedNode === this) {
					throw new UsageError(
						"A node may not be inserted into a location that is under itself",
					);
				}
				const parentNode: FlexTreeNode | undefined = unhydratedNode.parentField.parent.parent;
				assert(
					parentNode === undefined || parentNode instanceof UnhydratedFlexTreeNode,
					0xb77 /* Unhydrated node's parent should be an unhydrated node */,
				);
				unhydratedNode = parentNode;
			}
			this.location = { parent, index };
		} else {
			assert(
				this.location !== unparentedLocation,
				0xa09 /* Node may not be un-adopted if it does not have a parent */,
			);
			this.location = unparentedLocation;
		}
	}

	/**
	 * The field this tree is in, and the index within that field.
	 * @remarks If this node is unparented, this method will return the special {@link unparentedLocation} as the parent.
	 */
	public get parentField(): LocationInField {
		return this.location;
	}

	public borrowCursor(): ITreeCursorSynchronous {
		return cursorForMapTreeNode<MapTreeNodeViewGeneric<UnhydratedFlexTreeNode>>(this);
	}

	public tryGetField(key: FieldKey): UnhydratedFlexTreeField | undefined {
		const field = this.fieldsAll.get(key);
		// Only return the field if it is not empty, in order to fulfill the contract of `tryGetField`.
		if (field !== undefined && field.length > 0) {
			return field;
		}
	}

	public getBoxed(key: string): UnhydratedFlexTreeField {
		const fieldKey: FieldKey = brand(key);
		return this.getOrCreateField(fieldKey);
	}

	public keys(): IterableIterator<FieldKey> {
		return Array.from(this.fields, ([key]) => key)[Symbol.iterator]();
	}

	public get value(): Value {
		return this.data.value;
	}

	public emitChangedEvent(key: FieldKey): void {
		this._events.emit("childrenChangedAfterBatch", { changedFields: new Set([key]) });
	}
}

/**
 * Implementation of `FlexTreeContext`.
 *
 * @remarks An editor is required to edit the FlexTree.
 */
export class UnhydratedContext implements FlexTreeContext {
	/**
	 * @param flexSchema - Schema to use when working with the tree.
	 */
	public constructor(
		public readonly schemaPolicy: SchemaPolicy,
		public readonly schema: TreeStoredSchema,
	) {}

	public isDisposed(): boolean {
		return false;
	}

	public isHydrated(): this is FlexTreeHydratedContext {
		return false;
	}
}

// #region Fields

/**
 * A special singleton that is the implicit {@link LocationInField} of all un-parented {@link UnhydratedFlexTreeNode}s.
 * @remarks This exists because {@link UnhydratedFlexTreeNode.parentField} must return a field.
 * If a {@link UnhydratedFlexTreeNode} is created without a parent, its {@link UnhydratedFlexTreeNode.parentField} property will point to this object.
 * However, this field cannot be used in any practical way because it is empty, i.e. it does not actually contain the children that claim to be parented under it.
 * It has the "empty" schema and it will always contain zero children if queried.
 * Any nodes with this location will have a dummy parent index of `-1`.
 *
 * TODO: make this make sense.
 */
const unparentedLocation: LocationInField = {
	parent: {
		key: dummyRoot,
		parent: undefined,
		schema: brand(FieldKinds.optional.identifier),
	},
	index: 0,
};

/**
 * The {@link Unhydrated} implementation of {@link FlexTreeField}.
 */
export class UnhydratedFlexTreeField
	implements FlexTreeField, MapTreeFieldViewGeneric<UnhydratedFlexTreeNode>
{
	public [flexTreeMarker] = FlexTreeEntityKind.Field as const;

	public parent: UnhydratedFlexTreeNode | undefined = undefined;

	public constructor(
		public readonly context: FlexTreeContext,
		public readonly schema: FieldKindIdentifier,
		public readonly key: FieldKey,
		/**
		 * The children of this field.
		 * @remarks
		 * This is either an array of {@link UnhydratedFlexTreeNode}s or a {@link ContextualFieldProvider} that will be used to populate the children lazily (after which it will become an array).
		 * See {@link fillPendingDefaults}.
		 * Note that any fields using a {@link ConstantFieldProvider} should be evaluated before constructing the UnhydratedFlexTreeField.
		 */
		private lazyChildren: UnhydratedFlexTreeNode[] | ContextualFieldProvider,
	) {
		// When this field is created (which only happens one time, because it is cached), all the children become parented for the first time.
		// "Adopt" each child by updating its parent information to point to this field.
		if (Array.isArray(lazyChildren)) {
			for (const [i, child] of lazyChildren.entries()) {
				child.adoptBy(this, i);
			}
		}
	}

	public borrowCursor(): ITreeCursorSynchronous {
		return cursorForMapTreeField<MapTreeNodeViewGeneric<UnhydratedFlexTreeNode>>(
			this.children,
		);
	}

	private getPendingDefault(): ContextualFieldProvider | undefined {
		return !Array.isArray(this.lazyChildren) ? this.lazyChildren : undefined;
	}

	/**
	 * Populate pending default (if present) using the provided context.
	 * @remarks
	 * This apply to just this field: caller will likely want to recursively walk the tree.
	 * @see {@link pendingDefault}.
	 */
	public fillPendingDefaults(context: FlexTreeHydratedContextMinimal): void {
		const provider = this.getPendingDefault();
		if (provider) {
			const content = provider(context);
			this.lazyChildren = content;
		}
	}

	/**
	 * Returns true if this field has a pending default due to defined defined using a {@link ContextualFieldProvider}.
	 */
	public get pendingDefault(): boolean {
		return this.getPendingDefault() !== undefined;
	}

	public get children(): UnhydratedFlexTreeNode[] {
		const provider = this.getPendingDefault();
		if (provider) {
			const content = provider("UseGlobalContext");
			this.lazyChildren = content;
		}
		return this.lazyChildren as UnhydratedFlexTreeNode[];
	}

	public get length(): number {
		return this.children.length;
	}

	public is<TKind2 extends FlexFieldKind>(kind: TKind2): this is FlexTreeTypedField<TKind2> {
		return this.schema === kind.identifier;
	}

	public boxedAt(index: number): FlexTreeNode | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		const m = this.children[i];
		return m;
	}

	public [Symbol.iterator](): IterableIterator<UnhydratedFlexTreeNode> {
		return this.children[Symbol.iterator]();
	}

	/**
	 * Mutate this field.
	 * @param edit - A function which receives the current `MapTree`s that comprise the contents of the field so that it may be mutated.
	 * The function may mutate the array in place or return a new array.
	 * If a new array is returned then it will be used as the new contents of the field, otherwise the original array will be continue to be used.
	 * @remarks All edits to the field (i.e. mutations of the field's MapTrees) should be directed through this function.
	 * This function ensures that the parent MapTree has no empty fields (which is an invariant of `MapTree`) after the mutation.
	 */
	protected edit(
		edit: (mapTrees: UnhydratedFlexTreeNode[]) => void | UnhydratedFlexTreeNode[],
	): void {
		// Clear parents for all old map trees.
		for (const tree of this.children) {
			tree.adoptBy(undefined);
		}

		this.lazyChildren = edit(this.children) ?? this.children;

		// Set parents for all new map trees.
		for (const [index, tree] of this.children.entries()) {
			tree.adoptBy(this, index);
		}

		this.parent?.emitChangedEvent(this.key);
	}

	public getFieldPath(): NormalizedFieldUpPath {
		throw unsupportedUsageError("Editing an array");
	}

	/** Unboxes leaf nodes to their values */
	protected unboxed(index: number): TreeValue | UnhydratedFlexTreeNode {
		const child = this.children[index] ?? oob();
		const value = child.value;
		if (value !== undefined) {
			return value;
		}
		return child;
	}
}

/**
 * The {@link Unhydrated} implementation of {@link FlexTreeOptionalField}.
 */
export class UnhydratedOptionalField
	extends UnhydratedFlexTreeField
	implements FlexTreeOptionalField
{
	public readonly editor = {
		set: (newContent: FlexibleNodeContent | undefined): void => {
			if (newContent !== undefined) {
				assert(
					newContent instanceof UnhydratedFlexTreeNode,
					0xbb7 /* Expected unhydrated node */,
				);
			}

			this.edit((mapTrees) => {
				if (newContent !== undefined) {
					mapTrees[0] = newContent;
				} else {
					mapTrees.length = 0;
				}
			});
		},
	} satisfies OptionalFieldEditBuilder<FlexibleNodeContent> &
		ValueFieldEditBuilder<FlexibleNodeContent>;

	public get content(): FlexTreeUnknownUnboxed | undefined {
		const value = this.children[0];
		if (value !== undefined) {
			return this.unboxed(0);
		}

		return undefined;
	}
}

class UnhydratedRequiredField
	extends UnhydratedOptionalField
	implements FlexTreeRequiredField
{
	public override get content(): FlexTreeUnknownUnboxed {
		// This cannot use ?? since null is a legal value here.
		assert(
			super.content !== undefined,
			0xa57 /* Expected EagerMapTree required field to have a value */,
		);
		return super.content;
	}
}

/**
 * The {@link Unhydrated} implementation of {@link FlexTreeSequenceField}.
 */
export class UnhydratedSequenceField
	extends UnhydratedFlexTreeField
	implements FlexTreeSequenceField
{
	public readonly editor = {
		insert: (index, newContent): void => {
			for (const c of newContent) {
				assert(c !== undefined, 0xa0a /* Unexpected sparse array content */);
				assert(c instanceof UnhydratedFlexTreeNode, 0xbb8 /* Expected unhydrated node */);
			}
			const newContentChecked = newContent as readonly UnhydratedFlexTreeNode[];
			this.edit((mapTrees) => {
				if (newContent.length < 1000) {
					// For "smallish arrays" (`1000` is not empirically derived), the `splice` function is appropriate...
					mapTrees.splice(index, 0, ...newContentChecked);
				} else {
					// ...but we avoid using `splice` + spread for very large input arrays since there is a limit on how many elements can be spread (too many will overflow the stack).
					return mapTrees.slice(0, index).concat(newContentChecked, mapTrees.slice(index));
				}
			});
		},
		remove: (index, count): UnhydratedFlexTreeNode[] => {
			for (let i = index; i < index + count; i++) {
				const c = this.children[i];
				assert(c !== undefined, 0xa0b /* Unexpected sparse array */);
			}
			let removed: UnhydratedFlexTreeNode[] | undefined;
			this.edit((mapTrees) => {
				removed = mapTrees.splice(index, count);
			});
			return removed ?? fail(0xb4a /* Expected removed to be set by edit */);
		},
	} satisfies UnhydratedTreeSequenceFieldEditBuilder;

	public at(index: number): FlexTreeUnknownUnboxed | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		return this.unboxed(i);
	}
	public map<U>(callbackfn: (value: FlexTreeUnknownUnboxed, index: number) => U): U[] {
		return Array.from(this, callbackfn);
	}
}

// #endregion Fields

/** Creates a field with the given attributes */
export function createField(
	...args: ConstructorParameters<typeof UnhydratedFlexTreeField>
): UnhydratedFlexTreeField {
	switch (args[1]) {
		case FieldKinds.required.identifier:
		case FieldKinds.identifier.identifier:
			return new UnhydratedRequiredField(...args);
		case FieldKinds.optional.identifier:
			return new UnhydratedOptionalField(...args);
		case FieldKinds.sequence.identifier:
			return new UnhydratedSequenceField(...args);
		case FieldKinds.forbidden.identifier:
			// TODO: this seems to used by unknown optional fields. They should probably use "optional" not "Forbidden" schema.
			return new UnhydratedFlexTreeField(...args);
		default:
			return fail(0xb9d /* unsupported field kind */);
	}
}

export function unsupportedUsageError(message?: string): Error {
	return new UsageError(
		`${
			message ?? "Operation"
		} is not supported for content that has not yet been inserted into the tree`,
	);
}
