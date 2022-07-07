/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type If<Bool, T1, T2 = never> = Bool extends true ? T1 : T2;

export interface SetValue {
	type: "SetValue";
	value: Value;
}

export interface Modify<TInner = Mark, AllowSetValue extends boolean = true> {
	type?: "Modify";
	/**
	 * We need this setValue (in addition to the SetValue mark because non-leaf nodes can have values)
	 */
	value?: If<AllowSetValue, Value>;
	modify?: { [key: string]: (Offset | TInner | Modify<TInner, AllowSetValue>)[]; };
}

export type TraitMarks = (Offset | Mark)[];

export type ModsMark =
	| SetValue
	| Modify;
export type AttachMark =
	| Insert
	| MoveIn;
export type DetachMark =
	| MoveOut
	| Delete;
export type SegmentMark =
	| AttachMark
	| DetachMark;
export type ObjMark =
	| ModsMark
	| SegmentMark;

export type Mark =
	| ObjMark;

export interface HasMods {
	mods?: (Offset | ModsMark)[];
}

export interface Insert extends HasMods {
	type: "Insert";
	content: ProtoNode[];
}

export interface MoveIn extends HasMods, HasOpId {
	type: "MoveIn";
}

export interface Delete extends HasLength {
	type: "Delete";
	/**
	 * Applying a Delete over existing Modify marks has the follow effects on them and their descendants:
	 * (These effects are also applied to Modify marks over which a slice-deletion is performed)
	 * - setValue: removed
	 * - SetValue: replaced by an offset of 1
	 * - Insert: removed
	 * - MoveIn from MoveOut: MoveIn is removed, the corresponding MoveOut becomes a Delete
	 * - MoveIn from MoveOutStart: MoveIn is removed, the corresponding MoveOutStart becomes a StartDelete
	 * - Delete: replaced by an offset
	 * - MoveOut: preserved as is
	 * - MoveOutStart+End: preserved as is
	 */
	mods?: (Offset | Modify<MoveOut, false>)[];
}

/**
 * Used for set-like ranges and atomic ranges.
 */
export interface MoveOut extends HasLength, HasOpId {
	type: "MoveOut";
	/**
	 * Applying a MoveOut over existing Modify marks has the follow effects on them and their descendants:
	 * (These effects are also applied to Modify marks over which a slice-move-out is performed)
	 * - setValue: transplanted to the target location of the move.
	 * - SetValue: replaced by an offset of 1 and transplanted to the target location of the move.
	 * - Insert: transplanted to the target location of the move.
	 * - MoveIn from MoveOut: transplanted to the target location of the move. The corresponding MoveOut
	 *   is updated.
	 * - MoveIn from MoveOutStart: transplanted to transplanted to the target location of the move. The
	 *   corresponding MoveOutStart is updated.
	 * - Delete: replaced by an offset
	 * - MoveOut: preserved as is
	 * - MoveOutStart+End: preserved as is
	 */
	mods?: (Offset | Modify<MoveOut, false>)[];
}

export interface HasOpId {
	/**
	 * The ID of the corresponding MoveIn/MoveOut/End/SliceStart.
	 */
	op: OpId;
}

/**
 * The contents of a node to be created
 */
export interface ProtoNode {
	id: string;
	type?: string;
	value?: Value;
	traits?: ProtoTraits;
}

/**
 * The traits of a node to be created
 */
export interface ProtoTraits {
	[key: string]: ProtoTrait;
}

/**
 * TODO: update this doc comment.
 * A trait within a node to be created.
 * May include MoveIn segments if content that was not inserted as part of this change gets moved into
 * the inserted subtree. That MoveIn segment may itself contain other kinds of segments.
 *
 * Other kinds of segments are unnecessary at this layer:
 * - Modify & SetValue:
 *   - for a ProtoNode the new value overwrites the original
 *   - for a moved-in node the new value is represented by a nested Modify or SetValue mark
 * - Insert:
 *   - inserted ProtoNodes are added to the relevant ProtoTrait
 * - Delete:
 *   - deleted ProtoNodes are removed from the relevant ProtoTrait
 *   - deleted moved-in nodes are deleted at their original location and the MoveIn segment is removed/truncated
 * - MoveOut:
 *   - Moved out ProtoNodes are removed from the relevant ProtoTrait and a corresponding insert is created
 *   - Moved out moved-in nodes redirected to avoid the intermediate step (the MoveIn segment is removed/truncated)
 */
export type ProtoTrait = (ProtoNode | MoveIn)[];

export interface HasLength {
    /**
     * Omit if 1.
     */
    length?: number;
}

export type OpId = number;
export type Offset = number;
export type Index = number;
export type Value = number | string | boolean;
export type NodeId = string;
export type TraitLabel = string;
