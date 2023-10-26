/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeValue } from "../../../core";
import { RestrictiveReadonlyRecord } from "../../../util";
import { FieldKinds } from "../../default-field-kinds";
import { FieldKind } from "../../modular-schema";
import {
	AllowedTypes,
	Any,
	FieldNodeSchema,
	TreeFieldSchema,
	InternalTypedSchemaTypes,
	LeafSchema,
	MapSchema,
	ObjectNodeSchema,
	TreeNodeSchema,
	TreeSchema,
} from "../../typed-schema";
import { CheckTypesOverlap, AssignableFieldKinds, TreeNode } from "../editableTreeTypes";

/**
 * An object-like SharedTree node. Includes objects, lists, and maps.
 * @alpha
 */
export type SharedTreeNode =
	| SharedTreeList<AllowedTypes>
	| SharedTreeObject<ObjectNodeSchema>
	| SharedTreeMap<MapSchema>;

/**
 * Implements 'readonly T[]' and the list mutation APIs.
 * @alpha
 */
export interface SharedTreeList<
	TTypes extends AllowedTypes,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> extends ReadonlyArray<ProxyNodeUnion<TTypes, API>> {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAt(index: number, value: Iterable<ProxyNodeUnion<TTypes>>): void;

	/**
	 * Inserts new item(s) at the start of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtStart(value: Iterable<ProxyNodeUnion<TTypes>>): void;

	/**
	 * Inserts new item(s) at the end of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtEnd(value: Iterable<ProxyNodeUnion<TTypes>>): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if any of the input indices are invalid.
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the sequence.
	 * @param end - The ending index of the range to remove (exclusive).
	 * @throws Throws if any of the input indices are invalid.
	 * If `end` is not supplied or is greater than the length of the sequence, all items after `start` are deleted.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToStart<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: SharedTreeList<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToEnd<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: SharedTreeList<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;

	/**
	 * Moves the specified items to the desired location within the sequence.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the desired location within the sequence.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToIndex<TTypesSource extends AllowedTypes>(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: SharedTreeList<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;
}

/**
 * An object which supports property-based access to fields.
 * @alpha
 */
export type SharedTreeObject<
	TSchema extends ObjectNodeSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = ObjectFields<TSchema["objectNodeFieldsObject"], API>;

/**
 * Helper for generating the properties of a {@link SharedTreeObject}.
 * @privateRemarks
 * This type is composed of four subtypes for each mutually exclusive combination of "readonly" and "optional".
 * If it were possible to map to getters and setters separately, the "readonly" cases would collapse, but this is not currently a feature in TS.
 * See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
 * @alpha
 */
export type ObjectFields<
	TFields extends RestrictiveReadonlyRecord<string, TreeFieldSchema>,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = {
	// Filter for properties that are both assignable and optional; mark them `-readonly` and `?`.
	-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? TFields[key]["kind"] extends typeof FieldKinds.optional
			? key
			: never
		: never]?: ProxyField<TFields[key], API>;
} & {
	// Filter for properties that are assignable but are optional; mark them `-readonly` and `-?`.
	-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? TFields[key]["kind"] extends typeof FieldKinds.optional
			? never
			: key
		: never]-?: ProxyField<TFields[key], API>;
} & {
	// Filter for properties that are not assignable but are optional; mark them `readonly` and `?`.
	readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? never
		: TFields[key]["kind"] extends typeof FieldKinds.optional
		? key
		: never]?: ProxyField<TFields[key], API>;
} & {
	// Filter for properties that are not assignable and are not optional; mark them `readonly` and `-?`.
	readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? never
		: TFields[key]["kind"] extends typeof FieldKinds.optional
		? never
		: key]-?: ProxyField<TFields[key], API>;
};

/**
 * A map of string keys to tree objects.
 * @alpha
 */
export type SharedTreeMap<TSchema extends MapSchema> = Map<string, ProxyNode<TSchema>>;

/**
 * Given a field's schema, return the corresponding object in the proxy-based API.
 * @alpha
 */
export type ProxyField<
	TSchema extends TreeFieldSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
	// If "notEmpty", then optional fields will unbox to their content (not their content | undefined)
	Emptiness extends "maybeEmpty" | "notEmpty" = "maybeEmpty",
> = ProxyFieldInner<TSchema["kind"], TSchema["allowedTypes"], API, Emptiness>;

/**
 * Helper for implementing {@link InternalEditableTreeTypes#ProxyField}.
 * @alpha
 */
export type ProxyFieldInner<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
	API extends "javaScript" | "sharedTree",
	Emptiness extends "maybeEmpty" | "notEmpty",
> = Kind extends typeof FieldKinds.sequence
	? never // Sequences are only supported underneath FieldNodes. See FieldNode case in `ProxyNode`.
	: Kind extends typeof FieldKinds.required
	? ProxyNodeUnion<TTypes, API>
	: Kind extends typeof FieldKinds.optional
	? ProxyNodeUnion<TTypes, API> | (Emptiness extends "notEmpty" ? never : undefined)
	: unknown;

/**
 * Given multiple node schema types, return the corresponding object type union in the proxy-based API.
 * @alpha
 */
export type ProxyNodeUnion<
	TTypes extends AllowedTypes,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = TTypes extends readonly [Any]
	? unknown
	: {
			// TODO: Is the the best way to write this type function? Can it be simplified?
			// This first maps the tuple of AllowedTypes to a tuple of node API types.
			// Then, it uses [number] to index arbitrarily into that tuple, effectively converting the type tuple into a type union.
			[Index in keyof TTypes]: TTypes[Index] extends InternalTypedSchemaTypes.LazyItem<
				infer InnerType
			>
				? InnerType extends TreeNodeSchema
					? ProxyNode<InnerType, API>
					: never
				: never;
	  }[number];

/**
 * Given a node's schema, return the corresponding object in the proxy-based API.
 * @alpha
 */
export type ProxyNode<
	TSchema extends TreeNodeSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = TSchema extends LeafSchema
	? TreeValue<TSchema["leafValue"]>
	: TSchema extends MapSchema
	? API extends "sharedTree"
		? SharedTreeMap<TSchema>
		: Map<string, ProxyField<TSchema["mapFields"], API>>
	: TSchema extends FieldNodeSchema
	? API extends "sharedTree"
		? SharedTreeList<TSchema["objectNodeFieldsObject"][""]["allowedTypes"], API>
		: readonly ProxyNodeUnion<TSchema["objectNodeFieldsObject"][""]["allowedTypes"], API>[]
	: TSchema extends ObjectNodeSchema
	? SharedTreeObject<TSchema, API>
	: unknown;

/** The root type (the type of the entire tree) for a given schema collection */
export type ProxyRoot<
	TSchema extends TreeSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = TSchema extends TreeSchema<infer TRootFieldSchema> ? ProxyField<TRootFieldSchema, API> : never;

/** Symbol used to store a private/internal reference to the underlying editable tree node. */
const treeNodeSym = Symbol("TreeNode");

/** Helper to retrieve the stored tree node. */
export function getTreeNode(target: unknown): TreeNode | undefined {
	if (typeof target === "object" && target !== null) {
		return (target as { [treeNodeSym]?: TreeNode })[treeNodeSym];
	}

	return undefined;
}

/** Helper to set the stored tree node. */
export function setTreeNode(target: any, treeNode: TreeNode) {
	Object.defineProperty(target, treeNodeSym, {
		value: treeNode,
		// TODO: Investigate if this can be removed by properly implementing key-related traps in the proxy
		configurable: true,
	});
}
