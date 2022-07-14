/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, Value } from "../tree";
import { Brand, Opaque } from "../util";

/**
 * This format describes changes that must be applied to a document tree in order to update it.
 * Instances of this format are generated based on incoming changesets and consumed by a view layer (e.g., Forest) to
 * update itself.
 *
 * Because this format is only meant for updating document state, it does not fully represent user intentions.
 * For example, if some edit A inserts content and some subsequent edit B deletes that content, then a Delta that
 * represents the state update for these two edits would not include the insertion and deletion.
 * For the same reason, this format is also not fit to be rebased in the face of concurrent changes.
 * Instead this format is used to describe the end product of rebasing user intentions over concurrent edits.
 *
 * This format is self-contained in the following ways:
 *
 * 1. It uses integer indices (offsets, technically) to describe necessary changes.
 * As such, it does not rely on document nodes being randomly accessible by ID.
 *
 * 2. This format does not require historical information in order to apply the changes it describes.
 * For example, if a user undoes the deletion of a subtree, then the Delta generated for the undo edit will contain all
 * information necessary to re-create the subtree from scratch.
 *
 * This format can be generated from any Changeset without having access to the current document state.
 *
 * This format is meant to serve as the lowest common denominator to represent state changes resulting from any kind
 * of operation on any kind of field.
 * This means all such operations must be expressible in terms of this format.
 *
 * Future work:
 * - Define where and how field-specific and operation-specific metadata is meant to be represented.
 * - Add a move table to describe the src and dst paths of move operations.
 *
 * Within the above design constrains, this format is designed with the following goals in mind:
 *
 * 1. Make it easy to walk both a document tree and the delta tree to apply the changes described in the delta
 * with a minimum amount of backtracking over the contents of the tree.
 * This a boon for both code simplicity and performance.
 *
 * 2. Make it impossible to represent meaningless cases
 * (e.g., content being inserted within a deleted portion of the tree).
 * This both safeguard readers from having to handle such cases, and forces writers to critically examine their logic.
 *
 * 3. Make the format terse.
 *
 * 4. Make the format uniform.
 *
 * These goals are reflected in the following design choices (this is very much optional reading for users of this
 * format):
 *
 * 1. All marks that apply to field elements are represented in a single linear structure where marks that affect later
 * element of the document field appear after marks that affect earlier elements of the document field.
 *
 * If the marks were not ordered in this fashion then a consumer would need to backtrack within the document field.
 *
 * If the marks were represented in multiple such linear structures then it would be necessary to either:
 * - backtrack when iterating over one structure fully, then the next
 * - maintain a pointer within each such linear structure and advance them in lock-step (like in a k-way merge-sort but
 * more fiddly because of the offsets).
 *
 * The drawback of this design choice is that it relies heavily on polymorphism:
 * for each mark encountered a reader has to check which kind of mark it is.
 * This is a source of code and time complexity in the reader code and adds a memory overhead to the format since each
 * mark has to carry a tag field to announce what kind of mark it is. Some of the complexity is reduced by design
 * choice #3.
 *
 * 2. `MoveIn` marks in inserted portions of the document are inlined in their corresponding `ProtoField`.
 *
 * If the MoveIn marks were represented in a separate sub-structure (like they are under moved-in portions of the tree)
 * then the representation would forced to describe the path to them (in the form field keys and field offsets) from
 * the root of the inserted portion of the tree.
 * This would have two adverse effects:
 * - It would make the format less terse since this same path information would be redundant (it is already included in
 * the ProtoTree).
 * - It would lead the consumer of the format first build the inserted subtree, then traverse it again from its root to
 * apply the relevant `MoveIn` marks.
 *
 * 3. Modifications to subtrees that are also being deleted or moved are represented within the marks that describe such
 * deletions or movements.
 * This makes it possible specialize the type of the modifications in order to constrain the kinds of marks that can
 * appear below them.
 *
 * If modify marks were not specialized then it would be possible to represent meaningless cases and consumers of this
 * format would have to either provide implementations for them or detect when they they occur.
 * By specializing the types we move this "detection" to the Typescript compiler.
 *
 * 4. Modifications of deleted and moved-out nodes are represented using modify marks within `Delete` and `MoveOut`
 * marks.
 * This is in opposition to a structure where the fact that a modified node is being deleted or moved-out would
 * be represented a `Modify` mark like so:
 * ```typescript
 * interface ModifyAndDelete {
 *   type: typeof MarkType.ModifyAndDelete;
 *   fields: FieldMap<PositionedMarks<ModifyDeleted | MoveOut>>;
 * }
 * interface ModifyAndMoveOut {
 *   type: typeof MarkType.ModifyAndMoveOut;
 *   moveId: MoveId;
 *   fields: FieldMap<PositionedMarks<ModifyMovedOut | MoveOut>>;
 * }
 * export interface Delete {
 *   type: typeof MarkType.Delete;
 *   count: number;
 * }
 * export interface MoveOut {
 *   type: typeof MarkType.MoveOut;
 *   count: number;
 *   moveId: MoveId;
 * }
 * ```
 * Note the absence of modify information in `Delete` and `MoveOut` above.
 *
 * The benefit of the chosen representation over the alternative are two-fold:
 * - It leads to less splitting of moved and deleted ranges of nodes.
 * - It makes the format more uniform since modifications to moved-in subtrees must be represented with modifications
 * marks within a `MoveIn` mark.
 *
 * 5. `MoveIn` marks are represented in the location where the content being moved resides in the input context that
 * the delta is applied to, and `MoveOut` marks are represented in the location where the content being moved should
 * reside after the delta is applied.
 *
 * The alternative would be to allow such marks to appear in temporary locations (e.g., in field "bar" for a
 * transaction that moves content from "foo" to "bar" then moves that same content from "bar" to "baz").
 * This makes the format less terse and harder to reason about.
 *
 * 6. MoveIn marks are not inlined within `ProtoField`s.
 *
 * Inlining them would force the consuming code to detect `MoveIn` marks within the `ProtoField` and handle them
 * within the context of the insert.
 * This would be cumbersome because either the code that is responsible for consuming the `ProtoField` would need to
 * be aware of and have the context to handle `MoveIn`, or some caller of that code would need to find and extract such
 * `MoveIn` marks ahead to calling that code.
 */

/**
 * Represents the change made to a document.
 */
export type Root = PositionedMarks<OuterMark>;

/**
 * Represents a change being made to a part of the tree.
 */
export type Mark = OuterMark | InnerModify;

/**
 * A mark that represents changes to nodes that are otherwise unaffected by changes to their ancestors.
 */
export type OuterMark = Modify | Delete | MoveOut | MoveIn | Insert;

/**
 * A mark that represents changes to nodes that also unaffected by changes to their ancestors.
 */
export type InnerModify = ModifyDeleted | ModifyInserted | ModifyMovedIn | ModifyMovedOut;

/**
 * Represents a list of changes to some range of nodes. The index of each mark within the range of nodes, before
 * applying any of the changes, is not represented explicitly.
 * It corresponds to the sum of the following:
 * - The offsets of all preceding marks
 * - The number of nodes affected by all preceding marks, this is computed as follows:
 *   - Modify marks affect a single node
 *   - Delete marks affect `Delete.count` nodes
 *   - MoveOut marks affect `MoveOut.count` nodes
 * - The offset of the given mark
 */
export type PositionedMarks<TMark = Mark> = MarkWithOffset<TMark>[];

/**
 * See PositionedMarks.
 */
export interface MarkWithOffset<TMark = Mark> {
    offset: Offset;
    mark: TMark;
}

/**
 * Describes modifications made to a subtree that is otherwise untouched (i.e., not being inserted, deleted, or
 * moved).
 */
export interface Modify {
    type: typeof MarkType.Modify;
    setValue?: Value;
    fields?: FieldMarks<OuterMark>;
}

/**
 * Describes modifications made to a subtree that is being deleted.
 */
export interface ModifyDeleted {
    type: typeof MarkType.Modify;
    fields?: FieldMarks<ModifyDeleted | MoveOut>;
}

/**
 * Describes modifications made to a subtree that is being moved out.
 */
export interface ModifyMovedOut {
    type: typeof MarkType.Modify;
    setValue?: Value;
    fields?: FieldMarks<ModifyMovedOut | Delete | MoveOut>;
}

/**
 * Describes modifications made to a subtree that is being moved in.
 */
export interface ModifyMovedIn {
    type: typeof MarkType.Modify;
    fields?: FieldMarks<ModifyMovedIn | MoveIn | Insert>;
}

/**
 * Describes modifications made to a subtree that is being inserted.
 */
export interface ModifyInserted {
    type: typeof MarkType.Modify;
    fields?: FieldMarks<ModifyMovedIn | MoveIn>;
}

/**
 * Describes the deletion of a contiguous range of node.
 * Includes descriptions of the modifications made to those nodes (if any).
 */
export interface Delete {
    type: typeof MarkType.Delete;
    count: number;
    modify?: PositionedMarks<ModifyDeleted>;
}

/**
 * Describes the moving out of a contiguous range of node.
 * Includes descriptions of the modifications made to those nodes (if any).
 */
export interface MoveOut {
    type: typeof MarkType.MoveOut;
    count: number;
    /**
     * The delta should carry exactly one `MoveIn` mark with the same move ID.
     */
    moveId: MoveId;
    modify?: PositionedMarks<ModifyMovedOut>;
}

/**
 * Describes the moving in of a contiguous range of node.
 * Includes descriptions of the modifications made to those nodes (if any).
 */
export interface MoveIn {
    type: typeof MarkType.MoveIn;
    /**
     * The delta should carry exactly one `MoveOut` mark with the same move ID.
     */
    moveId: MoveId;
    modify?: PositionedMarks<ModifyMovedIn>;
}

/**
 * Describes the insertion of a contiguous range of node.
 * Includes descriptions of the modifications made to those nodes (if any).
 * Those are represented as `MoveIn` marks within `ProtoField`s.
 */
export interface Insert {
    type: typeof MarkType.Insert;
    content: ProtoNode[];
    modify?: PositionedMarks<ModifyInserted>;
}

/**
 * The contents of a subtree to be created
 */
export interface ProtoNode {
    id?: NodeId;
    type?: string;
    value?: Value;
    /**
     * The fields of a subtree to be created
     */
    fields?: FieldMap<ProtoField>;
}

export type ProtoField = ProtoNode[];

/**
 * Uniquely identifies a MoveOut/MoveIn pair within a transaction.
 * When the delta represents a whole transaction the MoveIn and MoveOut marks will both appear in the same delta.
 * Deltas can also represent a portion of a transaction, in which case it's possible the MoveIn and MoveOut marks with
 * the same `MoveId` will appear in different deltas.
 */
export type MoveId = Opaque<Brand<number, "delta.MoveId">>;

export type Offset = number;

/**
 * An identifier that a node might carry.
 * No uniqueness guarantees (across any scope) are made at this time.
 * TODO: Update comment once uniqueness guarantees can be made.
 */
export type NodeId = Opaque<Brand<string, "delta.NodeId">>;

export type FieldMap<T> = Map<FieldKey, T>;
export type FieldMarks<TMark> = FieldMap<PositionedMarks<TMark>>;

export const MarkType = {
    Modify: 0,
    Insert: 1,
    Delete: 2,
    MoveOut: 3,
    MoveIn: 4,
} as const;
