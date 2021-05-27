import { Serializable } from '@fluidframework/datastore-definitions';
import { ConstraintEffect } from '../default-edits';
import { ChangeNode as BuildNode } from '../generic';
// This file uses these as opaque id types:
// the user of these APIs should not know or care if they are short IDs or not, other than that they must be converted to StableId if stored for use outside of the shared tree it was acquired from.
// In practice, these would most likely be implemented as ShortId numbers.
import { DetachedSequenceId } from '../Identifiers';
import { RangeData, TreeNodeData } from './Anchors';
import { Sequence } from './Sequence';
import { PlaceView, RangeView, Trait, TreeNodeView } from './ViewAnchors';

/**
 * Mutable version of {@link PlaceView} allowing insertion to this Place.
 */
export interface Place extends PlaceView<Place, TreeNode, NodeParent, Range> {
	// Implicitly detaches or builds if needed then inserts (aka moves)?
	insert(nodes: TreeNodeData | RangeData | DetachedSequence | DetachedSequenceId | BuildNode): Range;

	// If the API is ambiguous we can add a move.
	// move(nodes: TreeNodeData | RangeData | DetachedSequence | DetachedSequenceId);
}

/**
 * Mutable version of {@link RangeView} allowing detaching and constraints on this range.
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
 * Mutable version of {@link TreeNodeView} allowing setValue on this TreeNode.
 */
export interface TreeNode extends TreeNodeView<Place, TreeNode, Range, NodeParent> {
	setValue(newValue: Serializable): void;
}

export type NodeParent = Trait<TreeNode, Place> | DetachedSequence;

export interface DetachedSequence extends Sequence<TreeNode, Place> {
	// TODO: Only needed to interop with currently build, remove after new builder?
	id: DetachedSequenceId;
}
