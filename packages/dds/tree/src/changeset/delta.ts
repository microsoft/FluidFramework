/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This format is designed with the following goals in mind:
 *
 * 1. Make it easy to walk both a document tree and the delta tree to apply the changes described in the delta
 * with a minimum amount of backtracking over the contents of the tree. This a boon for both code simplicity and
 * performance.
 *
 * 2. Make it impossible to represent meaningless cases (e.g., content being inserted within a deleted portion of the
 * tree). This both safeguard readers from having to handle such cases, and forces writers to critically examine their
 * logic.
 *
 * 3. Make the representation terse when possible.
 *
 * These goals are reflected in the following design choices:
 *
 * 1. All marks that apply to field elements are represented in a single linear structure where marks that affect later
 * element of the document field appear after marks that affect earlier elements of the document field.
 *
 * If the marks were not ordered in this fashion then a consumer would need to backtrack within the document field.
 *
 * If the marks were represented in multiple such linear structures then either backtracking would be necessary (when
 * iterating over one structure fully, then the next) or it would be necessary to maintain a pointer within each such
 * linear structure and advance them in lock-step (like in a k-way merge-sort but more fiddly because of the offsets).
 *
 * The drawback of this design choice is that it relies heavily on polymorphism: for each mark encountered a reader has
 * to check which kind of mark it is. This is a source of code and time complexity in the reader code and adds a memory
 * overhead to the format since each mark has to carry a tag field to announce what kind of mark it is. Some of the
 * complexity is reduced by design choice #3.
 *
 * 2. `MoveIn` marks in inserted portions of the document are inlined in their corresponding `ProtoField`.
 *
 * If the MoveIn marks were represented in a separate sub-structure (like they are under moved-in portions of the tree)
 * then the representation would forced to describe the path to them (in the form field keys and field offsets) from
 * the root of the inserted portion of the tree. This would have two adverse effects:
 * - It would make the format less terse since this same path information would be redundant (it is already included in
 * the ProtoTree).
 * - It would lead the consumer of the format first build the inserted subtree, then traverse it again from its root to
 * apply the relevant `MoveIn` marks.
 *
 * 3. The types of modify marks are specialized to constrain the kinds of marks that can appear below them.
 *
 * If modify marks were not specialized then it would be possible to represent meaningless cases and consumers of this
 * format would have to either provide implementations for them or detect when they they occur. By specializing the
 * types we move this "detection" to the Typescript compiler.
 */
export type Delta = (Offset | Modify | Delete | MoveOut | MoveIn | Insert)[];

export const type: unique symbol = Symbol("Delta.type");
export const setValue: unique symbol = Symbol("Delta.setValue");

export interface Modify {
	[type]: typeof MarkType.Modify;
	[setValue]?: Value;
	[key: FieldKey]: Delta;
}

export interface ModifyDel {
	[type]: typeof MarkType.Modify; // Use more specific value?
	[key: FieldKey]: (Offset | ModifyDel | MoveOut)[];
}

export interface ModifyOut {
	[type]: typeof MarkType.Modify;
	[setValue]?: Value;
	[key: FieldKey]: (Offset | ModifyOut | Delete | MoveOut)[];
}

export interface ModifyIn {
	[type]: typeof MarkType.Modify;
	[key: FieldKey]: (Offset | ModifyIn | MoveIn | Insert)[];
}

export interface Delete {
	[type]: typeof MarkType.Delete;
	count: number;
	modify?: (Offset | ModifyDel)[];
}

export interface MoveOut {
	[type]: typeof MarkType.MoveOut;
	count: number;
	moveId: MoveId;
	modify?: (Offset | ModifyOut)[];
}

export interface MoveIn {
	[type]: typeof MarkType.MoveIn;
	moveId: MoveId;
	modify?: (Offset | ModifyIn)[];
}

export interface Insert {
	[type]: typeof MarkType.Insert;
	content: ProtoTree[];
}

/**
 * The contents of a subtree to be created
 */
export interface ProtoTree {
	id: string;
	type?: string;
	value?: Value;
	fields?: ProtoFields;
}

/**
 * The fields of a subtree to be created
 */
export interface ProtoFields {
	[key: FieldKey]: ProtoField;
}

export type ProtoField = (ProtoTree | MoveIn)[];

export type MoveId = number;
export type Offset = number;
export type Index = number;
export type Value = number | string | boolean;
export type NodeId = string;
export type FieldKey = string;

export const MarkType = {
	Modify: 0,
	Insert: 1,
	Delete: 2,
	MoveOut: 3,
	MoveIn: 4,
} as const;
