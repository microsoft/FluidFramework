import { Serializable } from '@fluidframework/datastore-definitions';
import { ChangeNode, TreeNode as RawTreeNode } from '../generic';
// This file uses these as opaque id types:
// the user of these APIs should not know or care if they are short IDs or not, other than that they must be converted to StableId if stored for use outside of the shared tree it was acquired from.
// In practice, these would most likely be implemented as ShortId numbers.
import { Definition, NodeId, TraitLabel } from '../Identifiers';
import { Side } from '../Snapshot';
import { Anchor, PlaceData, RangeData, TreeNodeData } from './Anchors';
import { Sequence, SequenceIterator } from './Sequence';

/**
 * A kind of anchor for use within commands.
 */
export interface PlaceView<TPlace, TNode, TParent, TRange> extends Anchor, PlaceData {
	/**
	 * Iterate the trait (or DetachedSequence) containing this node, starting at this node.
	 */
	iteratorFromHere(): SequenceIterator<TNode, TPlace>;

	/**
	 * Parent of this Place.
	 *
	 * undefined if this Place at the root.
	 * TODO: what should we allow with root places? is the root a sequence so we can insert/delete there?Regarding #7
	 */
	readonly parent?: TParent;

	// TODO: add optional anchor policy parameters.
	adjacentNode(side: Side): TNode;

	// PlaceData must be after this in same trait for result to be valid.
	rangeTo(end: PlaceData): TRange;
}

/**
 * A kind of anchor for use within commands.
 */
export interface RangeView<TPlace, TNode, TRange> extends Anchor, RangeData, Sequence<TNode, TPlace> {
	readonly start: TPlace;
	readonly end: TPlace;

	// Could include moveTo(place) here, though it would be redundant with place.insert(range)

	/**
	 * Constraints
	 *
	 * TODO: This assumes we change how constraints work in our edits so they are a property of ranges that are checked when the range is used,
	 * and a Constraint op is just a use of a Range only for its constraint effect.
	 *
	 * TODO: is making this return a new range the right API?
	 *
	 * TODO: revisit this with context from anchor constraint DSL. Should these take in ConstraintEffect?
	 *
	 * TODO: this API could probably be refactored.
	 *
	 * @returns a Range that is invalid if the constraint is violated.
	 */
	withLength(
		length?: number // defaults to current length
	): TRange;
	withContents(
		contents?: Set<NodeId> // defaults to current contents
	): TRange;
	withContentsOrdered(
		constraint: ContentsConstraint,
		contents?: Iterable<NodeId> // defaults to current contents
	): TRange;
	withParent(
		parentNode?: NodeId // defaults to current parent
	): TRange;
	withTraitParent(
		label?: TraitLabel // defaults to current parent trait
	): TRange;
}

enum ContentsConstraint {
	UnorderedShallow,
	OrderedShallow,
	DeepEquality,
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
export interface TreeNodeView<TPlace, TNode, TRange, TParent>
	extends Anchor,
		TreeNodeData,
		Sequence<Trait<TNode, TPlace>, Query<TNode, TPlace>> {
	/**
	 * Parent of this Node.
	 *
	 * undefined if this node is the root.
	 */
	readonly parent?: TParent;

	readonly id: NodeId;
	readonly definition: Definition;

	// TODO: support value that might not have been loaded (maybe just use ensureLoaded for this? maybe have a way to load it separately).
	readonly value: Serializable; // This assumes the Serializable is immutable/copy on write.

	// Overrides version from Query providing more specific output.
	childrenFromTrait(label: TraitLabel): TRange;

	// Other accessors:
	// Could inline these, but for now list under separate object for easier maintenance.
	// Access children without boxing values in TreeNodes.
	readonly queryValue: Query<Serializable | TNode, TPlace>;

	// Access children as json compatible snapshots (will not change over time)
	// Includes node identities, values boxed into Nodes.
	readonly queryJsonSnapshot: Query<ChangeNode, TPlace>;

	// Access children as json compatible nodes (will change over time)
	// Includes node identities, values boxed into Nodes.
	readonly queryJsonProxy: Query<ChangeNode, TPlace>;

	// TODO: do we want to allow using the "json" objects as Anchors?
	// Should they have methods?

	// TODO: add optional anchor policy parameters.
	// This should probably default to a basic successor/predecessor anchor,
	// but allow opting into more expensive once when needed (ex: when you know its going into an edit or will need to be used across changes that could otherwise invalidate it)
	//
	// TODO: Once the API is in a more polished state consider adding short hand versions for predecessor and successor.
	adjacentPlace(side: Side): TPlace;
}

interface Query<TChild, TPlace> extends RawTreeNode<TChild> {
	readonly subtree: TChild;

	// TODO: add optional anchor policy parameters.
	// Stable across edits: behavior depends on anchoring.
	childrenFromTrait(label: TraitLabel): Sequence<TChild, TPlace>;

	// Maybe add child access helpers like these for common cases:
	childFromTrait(label: TraitLabel): TChild | undefined; // returns child if exactly 1.
	childFromPath(...label: TraitLabel[]): TChild | undefined; // returns child if exactly 1 child along each step of path.
	// Can be generalized to accept a query language/pattern
	childrenFromPath(...label: TraitLabel[]): SequenceIterator<TChild>; // returns all children matching path (might be scattered over multiple traits).
}

// Only needed when using TreeNode[Symbol.iterator]

export interface Trait<TNode, TPlace> extends Sequence<TNode, TPlace> {
	/**
	 * Parent of this Node.
	 *
	 * undefined if this node is the root.
	 */
	readonly parent?: TNode;
	readonly label: TraitLabel;
}

/**
 * Stable anchor based sequence of nodes. Can be held onto and iterated on across edits.
 * Behavior across edits depends on how it was anchored.
 */
// type NodeSequence = Sequence<TreeNodeView, PlaceView>;

/**
 * Stable anchor based sequence of nodes. Can be held onto and iterated on across edits.
 * Behavior across edits depends on how it was anchored.
 */
// type NodeIterator = SequenceIterator<TreeNodeView, PlaceView>;

// Note: other iterators are not assumed to be safe to use across edits (may be invalidated by edits)
// TODO: what do we do with invalid iterators? Throw recoverable error if used?
