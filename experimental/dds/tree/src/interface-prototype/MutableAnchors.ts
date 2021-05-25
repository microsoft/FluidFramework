import { Serializable } from '@fluidframework/datastore-definitions';
import { ConstraintEffect } from '../default-edits';
import { BuildNode } from '../generic';
// This file uses these as opaque id types:
// the user of these APIs should not know or care if they are short IDs or not, other than that they must be converted to StableId if stored for use outside of the shared tree it was acquired from.
// In practice, these would most likely be implemented as ShortId numbers.
import { DetachedSequenceId } from '../Identifiers';
import { RangeData, TreeNodeData } from './Anchors';
import { Sequence } from './Sequence';
import { PlaceView, RangeView, Trait, TreeNodeView } from './ViewAnchors';

/**
 * A kind of anchor for use within commands.
 */
export interface Place extends PlaceView<Place, TreeNode, NodeParent, Range> {
	// Implicitly detaches or builds if needed then inserts (aka moves)?
	insert(nodes: TreeNodeData | RangeData | DetachedSequence | DetachedSequenceId | BuildNode): Range;

	// If the API is ambiguous we can add a move.
	// move(nodes: TreeNodeData | RangeData | DetachedSequence | DetachedSequenceId);
}

/**
 * A kind of anchor for use within commands.
 */
export interface Range extends RangeView<Place, TreeNode, Range> {
	/**
	 * Detach this range from the tree.
	 *
	 * This range will point to the detached nodes, but the same range is also returned as the a more strongly typed DetachedSequence.
	 */
	detach(): DetachedSequence;

	// Could include moveTo(place) here, though it would be redundant with place.insert(range)

	// Add a a constraint that this range is valid to the current transaction.
	useAsConstraint(effect: ConstraintEffect): void;
}

/**
 * A kind of anchor for use within commands.
 * Mutable Tree view for use withing a Transaction.
 *
 * TODO:
 * most of this API is not implementable in the placeholder case.
 * Either:
 * make APIs that need to async fetch data throw
 * OR
 * expose placeholders in the API
 *
 * can also add async option which makes placeholders transparent.
 *
 * TODO: Trait iterator is invalidated by edits?
 */
export interface TreeNode extends TreeNodeView<Place, TreeNode, Range, NodeParent> {
	setValue(newValue: Serializable): void;
}

export type NodeParent = Trait<TreeNode, Place> | DetachedSequence;

export interface DetachedSequence extends Sequence<TreeNode, Place> {
	// TODO: Only needed to interop with currently build, remove after new builder?
	id: DetachedSequenceId;
}
