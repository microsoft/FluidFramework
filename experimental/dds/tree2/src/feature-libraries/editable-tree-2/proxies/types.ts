/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaAware } from "../..";
import { RestrictiveReadonlyRecord } from "../../../util";
import { FieldKinds } from "../../default-field-kinds";
import { FieldKind } from "../../modular-schema";
import {
	AllowedTypes,
	Any,
	FieldNodeSchema,
	FieldSchema,
	InternalTypedSchemaTypes,
	LeafSchema,
	MapSchema,
	StructSchema,
	TreeSchema,
} from "../../typed-schema";
import {
	UnboxNodeUnion,
	CheckTypesOverlap,
	FlexibleNodeContent,
	Sequence,
	NodeKeyField,
	AssignableFieldKinds,
} from "../editableTreeTypes";

/** Implements 'readonly T[]' and the list mutation APIs. */
export interface SharedTreeList<TTypes extends AllowedTypes>
	extends ReadonlyArray<UnboxNodeUnion<TTypes>> {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAt(index: number, value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Inserts new item(s) at the start of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtStart(value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Inserts new item(s) at the end of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtEnd(value: Iterable<FlexibleNodeContent<TTypes>>): void;

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
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
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
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
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

	// TODO: Should accept a proxy rather than sequence field as source.

	// /**
	//  * Moves the specified items to the desired location within the sequence.
	//  * @param index - The index to move the items to.
	//  * @param sourceStart - The starting index of the range to move (inclusive).
	//  * @param sourceEnd - The ending index of the range to move (exclusive)
	//  * @param source - The source sequence to move items out of.
	//  * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	//  * @remarks
	//  * All indices are relative to the sequence excluding the nodes being moved.
	//  */
	// moveToIndex<TTypesSource extends AllowedTypes>(
	// 	index: number,
	// 	sourceStart: number,
	// 	sourceEnd: number,
	// 	source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	// ): void;
}

/**
 * An object which supports property-based access to fields.
 * @alpha
 */
export type SharedTreeObject<TSchema extends StructSchema> = ObjectFields<
	TSchema["structFieldsObject"]
>;

/**
 * Helper for generating the properties of a {@link SharedTreeObject}.
 * @alpha
 */
export type ObjectFields<TFields extends RestrictiveReadonlyRecord<string, FieldSchema>> = {
	// Add getter only (make property readonly) when the field is **not** of a kind that has a logical set operation.
	// If we could map to getters and setters separately, we would preferably do that, but we can't.
	// See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
	readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? never
		: key]: ProxyField<TFields[key]>;
} & {
	// Add setter (make property writable) when the field is of a kind that has a logical set operation.
	// If we could map to getters and setters separately, we would preferably do that, but we can't.
	// See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
	-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? key
		: never]: ProxyField<TFields[key]>;
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
	TSchema extends FieldSchema,
	// If "notEmpty", then optional fields will unbox to their content (not their content | undefined)
	Emptiness extends "maybeEmpty" | "notEmpty" = "maybeEmpty",
> = ProxyFieldInner<TSchema["kind"], TSchema["allowedTypes"], Emptiness>;

/**
 * Helper for implementing {@link InternalEditableTreeTypes#ProxyField}.
 * @alpha
 */
export type ProxyFieldInner<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
	Emptiness extends "maybeEmpty" | "notEmpty",
> = Kind extends typeof FieldKinds.sequence
	? SharedTreeList<TTypes>
	: Kind extends typeof FieldKinds.required
	? ProxyNodeUnion<TTypes>
	: Kind extends typeof FieldKinds.optional
	? ProxyNodeUnion<TTypes> | (Emptiness extends "notEmpty" ? never : undefined)
	: // Since struct already provides a short-hand accessor for the local field key, and the field provides a nicer general API than the node under it in this case, do not unbox nodeKey fields.
	Kind extends typeof FieldKinds.nodeKey
	? NodeKeyField
	: // TODO: forbidden
	  unknown;

/**
 * Given multiple node schema types, return the corresponding object type union in the proxy-based API.
 * @alpha
 */
export type ProxyNodeUnion<TTypes extends AllowedTypes> = TTypes extends readonly [Any]
	? unknown
	: {
			// TODO: Is the the best way to write this type function? Can it be simplified?
			[Index in keyof TTypes]: TTypes[Index] extends InternalTypedSchemaTypes.LazyItem<
				infer InnerType
			>
				? InnerType extends TreeSchema
					? ProxyNode<InnerType>
					: never
				: never;
	  }[number];

/**
 * Given a node's schema, return the corresponding object in the proxy-based API.
 * @alpha
 */
export type ProxyNode<TSchema extends TreeSchema> = TSchema extends LeafSchema
	? SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]>
	: TSchema extends MapSchema
	? SharedTreeMap<TSchema>
	: TSchema extends FieldNodeSchema
	? ProxyField<TSchema["structFieldsObject"][""]>
	: TSchema extends StructSchema
	? SharedTreeObject<TSchema>
	: unknown;
