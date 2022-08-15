/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This format is meant to capture enough edit information to make it possible to either rebase those edits (onto other
 * edits also expressed in this format) or determine that the edits are conflicted.
 * The current goal is to be able to rebase all expressible edits (see AnchorInterfaces.ts) except for cases where the
 * merge requires re-running a hierarchical command that is domain-specific (i.e., not built-in at the SharedTree
 * layer).
 *
 * DISCLAIMER:
 * Some of the information needed to capture the intent of rebasable edits is not yet reflected in this format.
 * The missing pieces are:
 * - Type info
 * - Constraints
 *   - Explicit constraints
 *   - Observations made by hierarchical edits
 *
 * Remaining issues:
 *  - The active server (until then, each client locally) needs to store reversal info in the edit.
 *  - How do we update local edit in the face of peer edits and still represent them without losing intent?
 *  - Constraints and observations can be spatially distant from the changes of their transaction. (is this really an issue?)
 *  - Constraints and observations can end up fragmented
 *  - Constraints on values either
 *    - require recording the order of value changes vs value constraints (layer them in some way? could use a special trait)
 *       - wouldn't we have to save all value change before a value constraint since there's always the change that someone will move content
 *         under constrained subtree? I suppose such a move would fail the constraint no matter what (unless there's a hash collision).
 *    - should be stated as "can't have changed" constraints instead (adds false positives)
 */

/**
 * A set of changes made to a document.
 * These changes cannot be rebased over other changes, but rebasable change can be rebased over these changes.
 */
interface Changeset {
	/**
	 * When specified, describes the changes made to the document, starting at the root.
	 * Since most Changesets do not impact the root, a single Modify segment can be used in most cases.
	 */
	changes?: Modify | ChangeSegment[];
	/**
	 * Nodes that were deleted and re-created later, with possibly different data (e.g., as a result of reencoding).
	 * Each node may have been revived several times over the course of the Changeset. They are ordered from earliest
	 * to latest.
	 */
	revivals?: Map<NodeId, Revival[]>;
	/**
	 * Nodes that were deleted but may be re-created without changes in the future (e.g., as a result of cut and paste).
	 */
	clipboard?: Map<NodeId, ClipboardEntry>;
}

/**
 * A set of rebasable changes made to a document.
 */
 interface RebasableChangeset {
	changes?: Modify | RebasableChangeSegment[];
	revivals?: Map<NodeId, Revival[]>;
	clipboard?: Map<NodeId, ClipboardEntry>;
}

/**
 * A segment describing the changes made, if any, to a trait or its descendants.
 */
type Segment = UnchangedSegment | ChangeSegment;
type RebasableSegment = UnchangedSegment | RebasableChangeSegment | RebasableConstraint;

/**
 * A segment describing the changes made to a trait or its descendants.
 */
type ChangeSegment = Modify | Insert | MoveIn | MoveOut | Delete;
type RebasableChangeSegment = RebasableModify | RebasableInsert | RebasableMoveIn | RebasableMoveOut | RebasableDelete;

/**
 * A segment describing the absence of change being made to a sequence of nodes in a trait (and their descendants).
 * The value indicates the number of nodes being unchanged.
 */
type UnchangedSegment = number;

/**
 * A modification made to a subtree.
 */
interface Modify<TSegment = Segment> {
	/**
	 * When specified, indicates that the value of the node should be updated to the given value.
	 */
	[value]?: Value;
	/**
	 * Changes performed on traits of the subtree root, and below.
	 */
	//traits?: { [key: TraitLabel]: TSegment[] };
	[key: TraitLabel]: TSegment[]; // <- this or the line above needs to go
}
interface RebasableModify extends Modify<RebasableSegment> {
	/**
	 * We don't want to represent drilling here because if we do there's no way to easily communicate the interleaving
	 * of drill-based and normal operations.
	 */
	// drill?: { [key: TraitLabel]: RebasableSegment[] };
}

/**
 * A modification to a subtree under a deleted node.
 * This information is required in order to determine whether a stowaway passing through the deleted subtree
 * should be considered part of the deleted subtree or not.
 */
interface DeletedModify {
	/**
	 * Changes performed on traits of the subtree root, and below.
	 */
	[key: TraitLabel]: (UnchangedSegment | DeletedModify | Insert | MoveIn | MoveOut | Delete)[];
}
interface RebasableDeletedModify {
	/**
	 * Changes performed on traits of the subtree root, and below.
	 */
	[key: TraitLabel]: (UnchangedSegment | RebasableDeletedModify | RebasableInsert | RebasableMoveIn | RebasableMoveOut | RebasableDelete)[];
}

interface SequencedSegment {
	/**
	 * The sequence number assigned to the edit that this change was part of.
	 *
	 * Used to differentiate edits that were applied concurrently to the edit being rebased from those that were known
	 * to the edit being rebased.
	 */
	seq: SeqNumber;
}

type SeqNumber = number;

/**
 * Fields that are common to Insert and MoveIn
 */
interface PlaceOp extends SequencedSegment {
}
interface RebasablePlaceOp {
	/**
	 * Whether the attach was performed:
	 * - after the preceding sibling or (if there are no siblings before) after the start of the trait
	 * - before the successor sibling or (if there are no siblings after) before the end of the trait
	 *
	 * Treated as Sibling.Previous when omitted.
	 */
	side?: Sibling.Next;
	 /**
	 * Used to control the relative ordering of anchors that concurrently target the same place.
	 *
	 * Interpreted as Tiebreak.LastToFirst when omitted.
	 */
	tiebreak?: Tiebreak.FirstToLast;
	/**
	 * Sibling anchor movement rules.
	 * Omitted for parent-based place anchors.
	 */
	moveRules?: MovementRules;
	/**
	 * Either
	 *  * A positive integer that represents how high in the document hierarchy the drilldown started (0 = no drill).
	 *  * A pair whose elements describe
	 *    * The list of tree addresses of reference nodes that were drilled through (ordered from last to first)
	 *    * A positive integer that represents how high above the last reference node the drilldown started
	 */
	drill?: number | [TreePath[], number];
}

type TreePath = string;
type MovementRules = SimpleMovementRules | CustomMovementRules
enum SimpleMovementRules { NeverMove, CommutativeMove, AlwaysMove }
interface CustomMovementRules {
	traitLabel: TraitLabels;
	traitParent: TraitParents;
	siblingStatus: NodeStatuses;
	granularity: MoveGranularity;
	commutative: boolean;
}
enum TraitLabels { Initial, Any }
enum TraitParents { Initial, Any }
enum NodeStatuses { Alive, Deleted, Any }
enum MoveGranularity { IntraEdit, InterEdit, Any }

/**
 * An insertion of new nodes within a trait.
 */
interface Insert extends PlaceOp {
	type?: 'Insert';
	/**
	 * The contents being inserted, mixed in with the segments that affect them if any.
	 *
	 * If one of the inserted subtrees is modified:
	 * - values are updated in place
	 * - deleted nodes are replaced by a Delete segment in the relevant ProtoTrait
	 * - other modifications (Insert, MoveIn, MoveOut) are represented by adding a segment in the relevant ProtoTrait.
	 *
	 * If another insertion is relative to the inserted nodes:
	 * An Insert segment is added at the appropriate location.
	 * This helps keep track which node the inner insertion was relative to. It is tempting to think that flattening the
	 * inner Insert is safe since no one could have concurrently moved the insertion target of the inner insert without
	 * also moving the insertion target of the outer insert. Where this line of thinking goes wrong, is that the node
	 * (inserted by the outer insert) relative to which the inner insertion is made could have existed in the past. In
	 * other words, that node could be getting revived (and a local client may not know that).
	 *
	 * If other nodes are moved in relative to the inserted nodes:
	 * A MoveIn segment is added at the appropriate location. Same justification as above for the layering.
	 * We also need to represent Move-In specific information.
	 *
	 * If some of the inserted nodes are deleted:
	 * The affected ProtoNode are replaced by a Delete segment.
	 * Any prior modifications (excluding setValue operations) are preserved in the Delete segment's `DeletedModify`.
	 * We could probably shave off more segments from descendants if those were not affected by or did not affect
	 * moves to or from areas of the tree unaffected by this deletion.
	 *
	 * If some of those nodes get moved out:
	 * The affected ProtoNode are replaced by a MoveOut segment.
	 * The corresponding MoveIn segment will have the ProtoNode data in its `changes` array.
	 *
	 * Why do we need to record the inner MoveOut at all? Can't we pretend the content was inserted at the final
	 * location? There's no way a concurrent change being rebased on this Changeset would have a stowaway attached
	 * to one of the created nodes because they didn't exist before this Changeset, right?
	 * Wrong: a rebased change could have a stowaway attached to one of the created nodes in the case of a teleport.
	 * Event without teleports, it's possible that a change that is part of this CS might have moved existing nodes with
	 * a destination anchor that was tied to one of the these created nodes, and it's possible that a rebased change
	 * could have a stowaway attached to those moved nodes.
	 */
	contents: Exclude<Segment | ProtoNode, Modify>[];
}
interface RebasableInsert extends RebasablePlaceOp {
	type?: 'Insert';
	/**
	 * The contents being inserted, mixed in with the segments that affect them if any.
	 *
	 * If one of the inserted subtrees is modified:
	 * - values are updated in place
	 * - deleted nodes are replaced by a Delete segment in the relevant ProtoTrait
	 * - other modifications (Insert, MoveIn, MoveOut) are represented by adding a segment in the relevant ProtoTrait.
	 *
	 * If another insertion is relative to the inserted nodes:
	 * An Insert segment is added at the appropriate location.
	 * This helps keep track which node the inner insertion was relative to. It is tempting to think that flattening the
	 * inner Insert is safe since no one could have concurrently moved the insertion target of the inner insert without
	 * also moving the insertion target of the outer insert. Where this line of thinking goes wrong, is that the node
	 * (inserted by the outer insert) relative to which the inner insertion is made could have existed in the past. In
	 * other words, that node could be getting revived (and a local client may not know that).
	 *
	 * If other nodes are moved in relative to the inserted nodes:
	 * A MoveIn segment is added at the appropriate location. Same justification as above for the layering.
	 * We also need to represent Move-In specific information.
	 *
	 * If some of the inserted nodes are deleted:
	 * The affected ProtoNode are replaced by a Delete segment.
	 * Any prior modifications (excluding setValue operations) are preserved in the Delete segment's `DeletedModify`.
	 * We could probably shave off more segments from descendants if those were not affected by or did not affect
	 * moves to or from areas of the tree unaffected by this deletion.
	 *
	 * If some of those nodes get moved out:
	 * The affected ProtoNode are replaced by a MoveOut segment.
	 * The corresponding MoveIn segment will have the ProtoNode data in its `changes` array.
	 *
	 * Why do we need to record the inner MoveOut at all? Can't we pretend the content was inserted at the final
	 * location? There's no way a concurrent change being rebased on this Changeset would have a stowaway attached
	 * to one of the created nodes because they didn't exist before this Changeset, right?
	 * Wrong: a rebased change could have a stowaway attached to one of the created nodes in the case of a teleport.
	 * Event without teleports, it's possible that a change that is part of this CS might have moved existing nodes with
	 * a destination anchor that was tied to one of the these created nodes, and it's possible that a rebased change
	 * could have a stowaway attached to those moved nodes.
	 */
	contents: Exclude<RebasableSegment | ProtoNode, RebasableModify>[];
}

/**
 * Content being moved into the trait.
 */
interface MoveIn extends PlaceOp {
	type?: 'MoveIn';
	/**
	 * Path to the corresponding MoveOut segment within this Changeset.
	 */
	src: SegmentPath;
	/**
	 * Number of nodes being moved.
	 * Treated a 1 when not specified.
	 */
	count?: number;
	/**
	 * Further changes made to the moved content.
	 *
	 * When inserted content gets moved, the ProtoNode data ends up here. Note that since there is one MoveOut per MoveIn we can
	 * unambiguously trace back the source of a ProtoNode.
	 * Having the ProtoNode here allows updating the destination trait without having to figure out the original location of the
	 * ProtoNode instances.
	 */
	changes?: (ProtoNode | Segment)[];
}
interface RebasableMoveIn extends RebasablePlaceOp {
	type?: 'MoveIn';
	/**
	 * Path to the corresponding MoveOut segment within this Changeset.
	 */
	src: SegmentPath;
	/**
	 * Number of nodes being moved.
	 * Treated a 1 when not specified.
	 */
	count?: number;
	/**
	 * Further changes made to the moved content.
	 *
	 * When inserted content gets moved, the ProtoNode data ends up here. Note that since there is one MoveOut per MoveIn we can
	 * unambiguously trace back the source of a ProtoNode.
	 * Having the ProtoNode here allows updating the destination trait without having to figure out the original location of the
	 * ProtoNode instances.
	 */
	changes?: (ProtoNode | RebasableSegment)[];
}

/**
 * Fields that are common to Delete and MoveOut
 */
 interface RangeOp extends SequencedSegment {
	/**
	 * When present, indicates that the detach was performed with a slice-like range.
	 */
	bounds?: SliceBounds;
	/**
	 * The number of nodes being detached.
	 * Treated a 1 when not specified.
	 */
	count?: number;
}
 interface RebasableRangeOp {
	bounds?: RebasableSliceBounds;
	count?: number;
}

/**
 * Content being moved out of the trait.
 */
interface MoveOut extends RangeOp {
	type?: 'MoveOut';
	/**
	 * Path to the corresponding MoveIn segment within this Changeset.
	 */
	dst: SegmentPath;
	/**
	 * Further changes made to the region affected by this MoveOut.
	 * Insert and MoveIn are tracked here instead of higher up in the temporal hierarchy because they may be
	 * targeting a place relative to a where a moved node used to be.
	 *
	 * Nested MoveOut is used to preserve information about the multiple destinations. A stowaway being attached
	 * relative to one of the nodes being moved by the first/outer MoveOut may indeed adopt one destination but
	 * not the other.
	 *
	 * Nested Delete is included here because even though there's nothing left to delete, an attach operation targeting
	 * one of the moved out nodes might not follow the move but might care that the region of the trait is then deleted.
	 * Note: we currently have no way to allow the author of the attach operation to convey that they do care.
	 *
	 * Nested Modify is not included here because modifications made either prior to the MoveOut or between the MoveOut and
	 * MoveIn are always on the corresponding MoveIn.
	 */
	changes?: Exclude<Segment, Modify>[];
}
interface RebasableMoveOut extends RebasableRangeOp {
	type?: 'MoveOut';
	/**
	 * Path to the corresponding MoveIn segment within this Changeset.
	 */
	dst: SegmentPath;
	/**
	 * Further changes made to the region affected by this MoveOut.
	 * Insert and MoveIn are tracked here instead of higher up in the temporal hierarchy because they may be
	 * targeting a place relative to a where a moved node used to be.
	 *
	 * Nested MoveOut is used to preserve information about the multiple destinations. A stowaway being attached
	 * relative to one of the nodes being moved by the first/outer MoveOut may indeed adopt one destination but
	 * not the other.
	 *
	 * Nested Delete is included here because even though there's nothing left to delete, an attach operation targeting
	 * one of the moved out nodes might not follow the move but might care that the region of the trait is then deleted.
	 * Note: we currently have no way to allow the author of the attach operation to convey that they do care.
	 *
	 * Nested Modify is not included here because modifications made either prior to the MoveOut or between the MoveOut and
	 * MoveIn are always on the corresponding MoveIn.
	 */
	changes?: Exclude<RebasableSegment, RebasableModify>[];
}

/**
 * Content being deleted from a trait.
 */
interface Delete extends RangeOp {
	type?: 'Delete';
	/**
	 * Further changes made to the deleted content.
	 *
	 * Insert and MoveIn segments are included here (instead of higher up in the temporal hierarchy)
	 * because they may be targeting a place relative to a deleted node, which someone may concurrently move.
	 *
	 * DeletedModify is used to preserve information about changes made below the deleted nodes.
	 *
	 * MoveOut is used to preserve information about slice-like moves that were applied after this delete.
	 * This is needed for cases where a stowaway would adopt the inner move.
	 *
	 * Delete segments are not included because while a slice-like range might delete a portion of a trait
	 * that had already been deleted, there is no scenario under which we care. A concurrent attach that
	 * targets this portion may care that the node relative to which the insertion is made has been deleted
	 * but there's no way for it to care about the second deletion given the first.
	 * One usage of the format that may make us reconsider: if we were to try to undo the first deletion by
	 * removing this segment from the layering hierarchy (but preserving the nested segments under the parent
	 * of this segment). It's not clear whether we'll ever want to implement undo this way.
	 */
	changes?: (UnchangedSegment | Insert | MoveIn | MoveOut | DeletedModify)[];
}
interface RebasableDelete extends RebasableRangeOp {
	type?: 'Delete';
	/**
	 * Further changes made to the deleted content.
	 *
	 * Insert and MoveIn segments are included here (instead of higher up in the temporal hierarchy)
	 * because they may be targeting a place relative to a deleted node, which someone may concurrently move.
	 *
	 * DeletedModify is used to preserve information about changes made below the deleted nodes.
	 *
	 * MoveOut is used to preserve information about slice-like moves that were applied after this delete.
	 * This is needed for cases where a stowaway would adopt the inner move.
	 *
	 * Delete segments are not included because while a slice-like range might delete a portion of a trait
	 * that had already been deleted, there is no scenario under which we care. A concurrent attach that
	 * targets this portion may care that the node relative to which the insertion is made has been deleted
	 * but there's no way for it to care about the second deletion given the first.
	 * One usage of the format that may make us reconsider: if we were to try to undo the first deletion by
	 * removing this segment from the layering hierarchy (but preserving the nested segments under the parent
	 * of this segment). It's not clear whether we'll ever want to implement undo this way.
	 */
	changes?: (UnchangedSegment | RebasableInsert | RebasableMoveIn | RebasableMoveOut | RebasableDeletedModify)[];
}

interface RebasableConstraint extends RebasableRangeOp {
	/**
	 * Set when the range is constrained under a specific parent node.
	 * For slice-like ranges, this makes no sense as the constraint cannot be violated.
	 * For set-like ranges, each node of the original range, should it still exist, must be under the parent node whose
	 * trait this segment appears in. Note that those nodes may be under different traits.
	 */
	parent?: NodeId; // Could this just be `true` since we know the starting parent?
	/**
	 * Set when the range is constrained under a trait with a specific label.
	 * For slice-like ranges, this makes no sense as the constraint cannot be violated.
	 * For set-like ranges, each node of the original range, should it still exist, must be under a trait with the same
	 * label a the trait this segment appears in. Note that those nodes may be under different parents.
	 */
	label?: TraitLabel; // Could this just be `true` since we know the starting label?
	/**
	 * Set when the range is constrained to a specific length (in number of nodes).
	 * For slice-like ranges, nodes may have been concurrently added and removed from the range so long as the numbers
	 * even out.
	 * For set-like ranges, each of the nodes in the original range must still exist. Note that those nodes may have
	 * been deleted then re-inserted (as in cut & paste).
	 *
	 * NOT GOOD: if a constraint segment needs to be broken up in order to be layered on top of disjoint segments then
	 * the reported length can only be understood when piecing together the fragments of this constraint segment. This
	 * is not so bad for set-like range since we could update the length per fragment, but for slice-like ranges we
	 * can't do that.
	 * This problem is made worse by the fact that a concurrent change over which the constraint is rebased might
	 * break up the range in disjoint fragments that end up in different traits. This can only happen to set-like
	 * ranges though.
	 */
	length?: number; // Could this just be `true` since we know the starting length?
	/**
	 * Set when the range is constrained to contain a specific sequence of nodes (captured by a hash of their IDs).
	 * For slice-like ranges the range must contain the same set of nodes in the same order.
	 * For set-like ranges the nodes must still exist. This is equivalent to the `length` constraint.
	 *
	 * NOT GOOD: fragmentation makes this awkward. See `length`.
	 */
	identityHash?: string;
	/**
	 * Same as `identityHash` but using a deep traversal when hashing. Note that this includes scalar values.
	 * For slice-like ranges the range must contain the same set of nodes in the same order and their contents must be the same recursively.
	 * For set-like ranges the nodes must still exist and their contents must be the same recursively.
	 *
	 * NOT GOOD: fragmentation makes this awkward. See `length`.
	 */
	contentHash?: string;
}

/**
 * The relative location of the sibling based on which a segment or segment boundary is defined.
 */
enum Sibling {
	/**
	 * Used for, e.g., insertion after a given node.
	 */
	Previous,
	/**
	 * Used for, e.g., insertion before a given node.
	 */
	Next,
}

/**
 * The contents of a node to be created
 */
interface ProtoNode {
	id: string;
	type?: string;
	value?: Value;
	traits?: ProtoTraits;
}
interface RebasableProtoNode {
	id: string;
	type?: string;
	value?: Value;
	traits?: RebasableProtoTraits;
}

/**
 * The traits of a node to be created
 */
interface ProtoTraits {
	[key: TraitLabel]: ProtoTrait;
}
interface RebasableProtoTraits {
	[key: TraitLabel]: RebasableProtoTrait;
}

/**
 * A trait of a node to be created.
 * May include change segments if the trait was edited after creation.
 *
 * Modify segments are now allowed here. Instead, modifications are reflected as follows:
 * - values are updated in place
 * - deleted nodes are replaced by a Delete segment in the relevant ProtoTrait
 * - other modifications (Insert, MoveIn, MoveOut) are represented by adding a segment in the relevant ProtoTrait.
 */
type ProtoTrait<TSegments = Exclude<ChangeSegment, Modify>> = (ProtoNode | TSegments)[];
type RebasableProtoTrait = ProtoTrait<Exclude<RebasableChangeSegment, RebasableModify>>;

/**
 * The starting and ending bounds of a slice-like range.
 */
interface SliceBounds {
	/**
	 * When unspecified, the slice started before the containing segment.
	 * This is needed to prevent a rebased anchor targeting the place before the first node of the segment
	 * from mistakenly thinking it was not included in the slice. The rebased anchor may be unaffected by
	 * the operation on the slice, but it will fall within it no matter what.
	 */
	startingSide?: Sibling;
	/**
	 * When unspecified, the slice ended after the containing segment.
	 * This is needed to prevent a rebased anchor targeting the place after the last node of the segment
	 * from mistakenly thinking it was not included in the slice. The rebased anchor may be unaffected by
	 * the operation on the slice, but it will fall within it no matter what.
	 */
	endingSide?: Sibling;
}
interface RebasableSliceBounds extends SliceBounds {
	/**
	 * Used to control the relative ordering of anchors that concurrently target the same place.
	 * (For rebase only)
	 *
	 * Interpreted as Tiebreak.LastToFirst when omitted.
	 */
	startTiebreak?: Tiebreak.FirstToLast;
	/**
	 * Used to control the relative ordering of anchors that concurrently target the same place.
	 * (For rebase only)
	 *
	 * Interpreted as Tiebreak.LastToFirst when omitted.
	 */
	endTiebreak?: Tiebreak.FirstToLast;
	/**
	 * Either
	 *  * A positive integer that represents how high in the document hierarchy the drilldown started (0 = no drill).
	 *  * A pair whose elements describe
	 *    * The list of tree addresses of reference nodes that were drilled through (ordered from last to first)
	 *    * A positive integer that represents how high above the last reference node the drilldown started
	 */
	drill?: number | [TreePath[], number];
}

/**
 * Represents an occurrence of a node being deleted then re-created with possibly different data (e.g., as a result of reencoding).
 *
 * This data is used to allow stowaways to adopt the revived node as their target.
 */
interface Revival {
	/**
	 * The path to the Delete segment responsible for the deletion of the revived node.
	 */
	sourceSegment: SegmentPath;
	/**
	 * The index of the revived node within the Delete segment.
	 * If further changes were made to the node before its deletion then this index will point to a DeletedModify segment.
	 * If not, then this index will point to an UnchangedSegment segment (which will be omitted if no other changes were made to later parts of the deleted range).
	 */
	sourceIndex: number;
	/**
	 * The path to the Insert segment responsible for the re-creation of the revived node.
	 */
	destinationSegment: SegmentPath;
	/**
	 * The index, in terms of nodes, of the revived node within the destinationSegment.
	 * If further changes were made to the node after its revival then this index will fall within another segment.
	 * If not, this index will point to the adequate ProtoNode.
	 */
	destinationIndex: number;
}

/**
 * Describes a subtree which has been deleted but may be inserted again verbatim.
 *
 * This structure is only used to track subtrees that have not been inserted again.
 * Had the subtree been inserted again, its deletion would be represented as a MoveOut, and its insertion as a MoveIn.
 */
interface ClipboardEntry {
	/**
	 * The path to the Delete segment responsible for the cutting of the subtree.
	 */
	sourceSegment: SegmentPath;
	/**
	 * The contents of the subtree on the clipboard.
	 * Only specified when the subtree was created or modified over the course of this Changeset.
	 */
	contents?: ProtoNode | Modify;
}

/**
 * A string that describes the location of a Segment in terms of its path from the root-level Modify Segment.
 *
 * The string is represented as a concatenation of trait names and indices separated by dots ('.').
 * Note that the indices represent segments, not nodes.
 *
 * If the root changes of the Changeset is a Modify segment then the path match the following JS regular expression:
 * /^(\.(\w+\.)?\d+)*$/
 * If the root changes of the Changeset is an array then the path must match following JS regular expression:
 * /^\d+(\.(\w+\.)?\d+)*$/
 *
 * Addressing a segment within another segment is done as follows:
 *  - When the parent segment is a Modify segment, the path to the child segment is composed of the name of
 *    trait under which the child segment resides, followed by a dot ('.'), followed by the index of the
 *    target child segment under that trait.
 *  - For all other types of parent segments, only the index of the target child segment is needed because
 *    other segment types only include one list of child segments.
 */
type SegmentPath = string;

const value = Symbol();
type Value = number | string | boolean;
type NodeId = string;
type TraitLabel = string;
enum Tiebreak { LastToFirst, FirstToLast }

namespace Swaps {
	// Swap foo and bar nodes
	const swap: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, count: 1, dst: { bar: 1 } },
				{ type: 'MoveIn', seq: 1, count: 1, src: { bar: 0 } },
			],
			bar: [
				{ type: 'MoveOut', seq: 1, count: 1, dst: { foo: 1 } },
				{ type: 'MoveIn', seq: 1, count: 1, src: { foo: 0 } },
			],
		}
	};

	// Swap foo and bar nodes (without the optional `type` and `count` fields)
	const swapTerse: Changeset = {
		changes: {
			foo: [
				{ seq: 1, dst: { bar: 1 } },
				{ seq: 1, src: { bar: 0 } },
			],
			bar: [
				{ seq: 1, dst: { foo: 1 } },
				{ seq: 1, src: { foo: 0 } },
			],
		}
	};

	// Swap foo and bar nodes and back again
	const swapAndBack: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, dst: { bar: 1 } },
				{
					type: 'MoveIn',
					seq: 1,
					src: { bar: 0 },
					changes: [
						{ type: 'MoveOut', seq: 2, dst: { bar: 2 } },
					],
				},
				{ type: 'MoveIn', seq: 2, src: "bar.1.0" },
			],
			bar: [
				{ type: 'MoveOut', seq: 1, dst: { foo: 1 } },
				{
					type: 'MoveIn',
					seq: 1,
					src: { foo: 0 },
					changes: [
						{ type: 'MoveOut', seq: 2, dst: { foo: 2 } },
					],
				},
				{ type: 'MoveIn', seq: 2, src: "foo.1.0" },
			],
		}
	};

	// Swap parent/child:
	// From: A{ foo: B{ bar: C } }
	// To:   A{ foo: C{ bar: B } }
	const swapParentChild: Changeset = {
		changes: {
			foo: [
				{
					type: 'MoveOut',
					seq: 1,
					dst: "foo.1.0.bar.0",
				},
				{
					type: 'MoveIn',
					seq: 1,
					src: "foo.1.0.bar.0.0.bar.0",
					changes: [
						{
							bar: [
								{
									type: 'MoveIn',
									seq: 1,
									src: { foo: 0 },
									changes: [
										{
											bar: [
												{
													type: 'MoveOut',
													seq: 1,
													dst: { foo: 1 },
												},
											],
										},
									],
								},
							],
						},
					],
				},
			],
		}
	};

	// Swap parent/child:
	// From: A{ foo: B{ bar: C{ baz: D } } }
	// To:   A{ foo: C{ bar: B{ baz: D } } }
	const swapParentChild2: Changeset = {
		changes: {
			foo: [
				{
					type: 'MoveOut', // B
					seq: 1,
					dst: "foo.1.0.bar.0",
				},
				{
					type: 'MoveIn', // C
					seq: 1,
					src: "foo.1.0.bar.0.0.bar.0",
					changes: [
						{
							bar: [
								{
									type: 'MoveIn', // B
									seq: 1,
									src: { foo: 0 },
									changes: [
										{
											bar: [
												{
													type: 'MoveOut', // C
													seq: 1,
													dst: { foo: 1 },
												},
											],
											baz: [
												{
													type: 'MoveIn', // D
													seq: 1,
													src: "foo.1.0.baz.0",
												},
											],
										},
									],
								},
							],
							baz: [
								{
									type: 'MoveOut', // D
									seq: 1,
									dst: "foo.1.0.bar.0.0.baz.0",
								},
							]
						},
					],
				},
			],
		}
	};
	const swapParentChild2Verbose: Changeset = {
		changes: {
			foo: [
				{
					type: 'MoveOut', // B
					seq: 1,
					dst: "foo.1.0.bar.0",
					// count: 1,
				},
				{
					type: 'MoveIn', // C
					seq: 1,
					src: "foo.1.0.bar.0.0.bar.0",
					// count: 1,
					// side: Sibling.Previous,
					// tiebreak: Tiebreak.LastToFirst,
					changes: [
						{
							bar: [
								{
									type: 'MoveIn', // B
									seq: 1,
									src: { foo: 0 },
									// count: 1,
									// side: Sibling.Previous,
									// tiebreak: Tiebreak.LastToFirst,
									changes: [
										{
											bar: [
												{
													type: 'MoveOut', // C
													seq: 1,
													dst: { foo: 1 },
													// count: 1,
												},
											],
											baz: [
												{
													type: 'MoveIn', // D
													seq: 1,
													src: "foo.1.0.baz.0",
													// count: 1,
													// side: Sibling.Previous,
													// tiebreak: Tiebreak.LastToFirst,
												},
											],
										},
									],
								},
							],
							baz: [
								{
									type: 'MoveOut', // D
									seq: 1,
									dst: "foo.1.0.bar.0.0.baz.0",
									// count: 1,
								},
							]
						},
					],
				},
			],
		}
	};

	// Swap parent/child:
	// From: A{ foo: B{ bar: C{ baz: D } } }
	// To:   A{ foo: C{ bar: B{ baz: D } } }
	const swapParentChild2Terse = {
		changes: {
			foo: [
				{
					dst: "^1.0.bar.0",
				},
				{
					src: ".0.bar.0.0.bar.0",
					changes: {
						bar: {
							src: { foo: 0 },
							changes: {
								bar: {
									dst: { foo: 1 },
								},
								baz: {
										src: "foo.1.0.baz.0",
									},
							},
						},
						baz: {
							dst: "^^bar.0.0.baz.0",
						},
					},
				},
			],
		}
	};
}

namespace CumulativeInsert {
	// Starting state [A B]

	// First sequenced edit (Client 1)
	// yields state [F A B]
	const e1: Changeset = {
		changes: {
			foo: [
				{ type: 'Insert', seq: 1, contents: [{id: 'F'}]},
			],
		}
	};

	// Second sequenced edit (Client 2)
	// yields state [A U V B] (will be [F A U V B] after rebase)
	const e2a: Changeset = {
		changes: {
			foo: [
				1, // Skip over A
				{ type: 'Insert', seq: 2, contents: [{id: 'U'}, {id: 'V'}]},
			],
		}
	};

	// Third sequenced edit (Client 2)
	// yields state [A U X V B] (will be [F A U X V B] after rebase)
	const e2b: Changeset = {
		changes: {
			foo: [
				2, // Skip over A U
				{ type: 'Insert', seq: 2, contents: [{id: 'X'}]},
			],
		}
	};

	// Collaboration Changeset after e1 and e2a
	// yields state [F A U V B]
	const wcs2a: Changeset = {
		changes: {
			foo: [
				{ type: 'Insert', seq: 1, contents: [{id: 'F'}]},
				1, // Skip over A
				{ type: 'Insert', seq: 2, contents: [{id: 'U'}, {id: 'V'}]},
			],
		}
	};

	// Collaboration Changeset after e1, e2a, e2b
	// yields state [F A U X V B]
	const wcs2b: Changeset = {
		changes: {
			foo: [
				{ type: 'Insert', seq: 1, contents: [{id: 'F'}]},
				1, // Skip over A
				{
					type: 'Insert',
					seq: 2,
					contents: [
						{ id: 'U' },
						{ type: 'Insert', seq: 2, contents: [{id: 'X'}] },
						{ id: 'V' }
					],
				},
			],
		}
	};
}

namespace MoveToMovedLocation {
	// Starting local state
	//   foo: [A B C]
	//   bar: [U V]

	// First sequenced edit (Client 1)
	// yields state
	//   foo: [A B C]
	//   bar: [V]
	//   baz: [U]
	const e1: Changeset = {
		changes: {
			bar: [
				{ type: 'MoveOut', seq: 0, dst: { baz: 0 } },
			],
			baz: [
				{ type: 'MoveIn', seq: 0, src: { bar: 0 } },
			],
		}
	};

	// Second sequenced edit (Client 2)
	// yields local state
	//   foo: [C]
	//   bar: [U A B V]
	// which after rebasing will be
	//   foo: [C]
	//   bar: [V]
	//   baz: [U A B]
	const e2a: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, dst: { bar: 1 }, count: 2, bounds: {}},
			],
			bar: [
				1,
				{ type: 'MoveIn', seq: 1, src: { foo: 0 }, count: 2 },
			],
		}
	};

	// Third sequenced edit (Client 2)
	// yields local state
	//   foo: [C]
	//   bar: [U A X B V]
	// which after rebasing will be
	//   foo: [C]
	//   bar: [V]
	//   baz: [U A X B]

	const e2b: Changeset = {
		changes: {
			bar: [
				2,
				{ type: 'Insert', seq: 2, contents: [{id: 'X'}]},
			],
		}
	};

	// Squashed e2a and e2b
	const e2ae2b: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, dst: { bar: 1 }, count: 2, bounds: {}},
			],
			bar: [
				1,
				{
					type: 'MoveIn',
					seq: 1,
					src: { foo: 0 },
					count: 2,
					changes: [
						1,
						{ type: 'Insert', seq: 2, contents: [{id: 'X'}]},
					],
				},
			],
		}
	};

	// Rebased version of e2a
	const e2aPrime: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, dst: { baz: 1 }, count: 2, bounds: {}},
			],
			baz: [
				1,
				{ type: 'MoveIn', seq: 1, src: { foo: 0 }, count: 2 },
			],
		}
	};

	// Rebased version of e2b if following A B
	const e2bPrimeFollow: Changeset = {
		changes: {
			baz: [
				2,
				{ type: 'Insert', seq: 2, contents: [{id: 'X'}] },
			],
		}
	};

	// Squash of e1 and e2a'
	const e1e2ap: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, dst: { baz: 1 }, count: 2, bounds: {}},
			],
			bar: [
				{ type: 'MoveOut', seq: 0, dst: { baz: 0 } },
			],
			baz: [
				{ type: 'MoveIn', seq: 0, src: { bar: 0 } },
				{ type: 'MoveIn', seq: 1, src: { foo: 0 }, count: 2 },
			],
		}
	};


	// Squash of e1, e2a', e2b' for the case where the insertion of X follows AB
	const e1e2ape2bp_follow: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, dst: { baz: 1 }, count: 2, bounds: {}}, // AB
			],
			bar: [
				{
					type: 'MoveOut', // Move U
					seq: 0,
					dst: { baz: 0 },
					changes: [
						1, // Skip U
						{
							type: 'MoveIn', // AB
							seq: 1, // ??
							src: { foo: 0 },
							count: 2,
							changes: [
								{
									type: 'MoveOut', // AB
									seq: 1, // ??
									dst: { baz: 1 },
									count: 2,
									bounds: {},
									changes: [
										1, // Skip A
										{ type: 'Insert', seq: 2, contents: [{id: 'X'}]},
									],
								}
							],
						},
					],
				},
			],
			baz: [
				{ type: 'MoveIn', seq: 0, src: { bar: 0 } }, // U
				{
					type: 'MoveIn', // AB
					seq: 1, // ??
					src: "bar.0.1.0",
					count: 2,
				},
			],
		}
	};

	// Squash of e1, e2a', e2b' for the case where the insertion of X does not follow AB
	const e1e2ape2bp_stay: Changeset = {
		changes: {
			foo: [
				{ type: 'MoveOut', seq: 1, dst: { baz: 1 }, count: 2, bounds: {}},
			],
			bar: [
				{ type: 'MoveOut', seq: 0, dst: { baz: 0 } },
			],
			baz: [
				{ type: 'MoveIn', seq: 0, src: { bar: 0 } },
				{
					type: 'MoveIn',
					seq: 1,
					src: { foo: 0 },
					count: 2,
					changes: [
						1, // Skip A
						{ type: 'Insert', seq: 2, contents: [{id: 'X'}]},
					],
				},
			],
		}
	};
}

namespace DeleteAndInsertMix {
	// Different ways to get from starting state [A B C D] to final state [A X D]
	// Not trying to be exhaustive, just listing how some different sequences of changes
	// end up being represented different in the format.

	/**
	 * Either:
	 *  - Insert X after A
	 *  - Delete B
	 *  - Delete C
	 * Or:
	 *  - Insert X after A
	 *  - Delete C
	 *  - Delete B
	 */
	const e1: Changeset = {
		changes: {
			foo: [
				1,
				{ type: 'Delete', seq: 1 },
				{ type: 'Insert', seq: 1, contents: [{id: 'X'}]},
				{ type: 'Delete', seq: 1 },
			],
		}
	};

	/**
	 * - Delete B C
	 * - Insert X after B
	 */
	const e2: Changeset = {
		changes: {
			foo: [
				1,
				{
					type: 'Delete',
					seq: 1,
					count: 2,
					changes: [
						1,
						{ type: 'Insert', seq: 1, contents: [{id: 'X'}]},
					]
				},
			],
		}
	};

	/**
	 * Either:
	 *  - Delete B C
	 *  - Insert X after A
	 * Or:
	 *  - Insert X after A
	 *  - Delete B C
	 */
	const e3: Changeset = {
		changes: {
			foo: [
				1,
				{ type: 'Insert', seq: 1, contents: [{id: 'X'}]},
				{ type: 'Delete', seq: 1, count: 2 },
			],
		}
	};
}

/**
 * Interesting scenario we have no way to express intentions for but likely should:
 * In [A B C D]
 * 1. User 1: Move B to trait bar
 * 2. User 2: Delete slice-like range A -> D (does not delete B)
 * 3. User 3: Insert X after B (never-move rules) <- how do we make this commute?
 */
