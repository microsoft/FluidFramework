import { Serializable } from '@fluidframework/datastore-definitions';
import { ChangeNode, TreeNode as RawTreeNode } from '../generic';
// This file uses these as opaque id types:
// the user of these APIs should not know or care if they are short IDs or not, other than that they must be converted to StableId if stored for use outside of the shared tree it was acquired from.
// In practice, these would most likely be implemented as ShortId numbers.
import { Definition, NodeId, TraitLabel, DetachedSequenceId } from '../Identifiers';
import { Side } from '../Snapshot';
import { Anchor, PlaceData, RangeData, TreeNodeData } from './Anchors';
import { Sequence, SequenceIterator } from './Sequence';

/**
 * The anchors in this file are all contextualized (extend `Anchor`/ have a revision they refer to),
 * and thus can be used to navigate around within the tree at that revision.
 *
 * In `Checkout.ts` there are methods which take these allow modifying the tree（usable within Commands）,
 * creating actual edits which use these anchors to encode the tree locations within the edits.
 */

/**
 * An Anchor for a space between nodes in a trait, or at the beginning or end of a trait.
 * Used for the destination of inserts, and for the ends of ranges.
 */
export interface Place extends Anchor, PlaceData {
	/**
	 * Construct a range from this Place to `end`.
	 * PlaceData must be after this in same trait for result to be valid.
	 */
	rangeTo(end: PlaceData): Range;

	// Below here only available if loaded and valid.

	/**
	 * Iterate the trait (or DetachedSequence) containing this node, starting at this node.
	 */
	iteratorFromHere(): SequenceIterator<TreeNode, Place>;

	/**
	 * Parent of this Place.
	 */
	readonly parent: NodeParent;

	/**
	 * @returns the adjacent node, anchored by its NodeId, or `undefined` if an end of the trait is reached.
	 */
	// TODO: add optional anchor policy parameters?
	adjacentNode(side: Side): TreeNode | undefined;
}

export type NodeParent = Trait | DetachedRange;

/**
 * A root of the forest.
 */
export interface DetachedRange extends Range {
	readonly start: DetachedPlace;
	readonly end: DetachedPlace;
}

export interface DetachedPlace extends Place {
	readonly parent: DetachedRange;
}

/**
 * An anchor to a subset of a trait.
 * Used for the source of moves and deletes/detach.
 * Also used for constraints.
 */
export interface Range extends Anchor, RangeData, TraitSection {
	readonly start: Place;
	readonly end: Place;

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
	): Range;
	withContents(
		contents?: Set<NodeId> // defaults to current contents
	): Range;
	withContentsOrdered(
		constraint: ContentsConstraint,
		contents?: Iterable<NodeId> // defaults to current contents
	): Range;
	withParent(
		parentNode?: NodeId // defaults to current parent
	): Range;
	withTraitParent(
		label?: TraitLabel // defaults to current parent trait
	): Range;
}

export enum ContentsConstraint {
	UnorderedShallow,
	OrderedShallow,
	DeepEquality,
}

/**
 * An anchor to a particular node.
 * Used in SetValue.
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
export interface TreeNode extends Anchor, TreeNodeData, Sequence<Trait>, Query<TreeNode> {
	readonly id: NodeId;

	// TODO: add optional anchor policy parameters.
	// This should probably default to a basic successor/predecessor anchor,
	// but allow opting into more expensive once when needed (ex: when you know its going into an edit or will need to be used across changes that could otherwise invalidate it)
	//
	// TODO: Once the API is in a more polished state consider adding short hand versions for predecessor and successor.
	adjacentPlace(side: Side): Place;

	// Below here only available if loaded and valid.

	/**
	 * Parent of this Node.
	 */
	readonly parent: NodeParent;

	readonly definition: Definition;

	// TODO: support value that might not have been loaded (maybe just use ensureLoaded for this? maybe have a way to load it separately).
	readonly value: Serializable; // This assumes the Serializable is immutable/copy on write.

	// Overrides version from Query providing more specific output.
	childrenFromTrait(label: TraitLabel): Range;

	// Other accessors:
	// Could inline these, but for now list under separate object for easier maintenance.
	// Access children without boxing values in TreeNodes.
	readonly queryValue: Query<Serializable | TreeNode>;

	// Access children as json compatible snapshots (will not change over time)
	// Includes node identities, values boxed into Nodes.
	readonly queryJsonSnapshot: Query<ChangeNode>;

	// Access children as json compatible nodes (will change over time)
	// Includes node identities, values boxed into Nodes.
	readonly queryJsonProxy: Query<ChangeNode>;

	// TODO: do we want to allow using the "json" objects as Anchors?
	// Should they have methods?
}

interface Query<TChild> extends RawTreeNode<TChild> {
	readonly subtree: TChild;

	// TODO: add optional anchor policy parameters.
	// Stable across edits: behavior depends on anchoring.
	childrenFromTrait(label: TraitLabel): TraitSection<TChild>;

	// Maybe add child access helpers like these for common cases:
	childFromTrait(label: TraitLabel): TChild | undefined; // returns child if exactly 1.
	childFromPath(...label: TraitLabel[]): TChild | undefined; // returns child if exactly 1 child along each step of path.
	// Can be generalized to accept a query language/pattern
	childrenFromPath(...label: TraitLabel[]): SequenceIterator<TChild>; // returns all children matching path (might be scattered over multiple traits).
}

// Only needed when using TreeNode[Symbol.iterator]

export interface Trait extends TraitSection {
	/**
	 * Parent of this Node.
	 *
	 * undefined if this node is the root.
	 */
	readonly parent?: TreeNode;
	readonly label: TraitLabel;
}

/**
 * Stable anchor based sequence of nodes. Can be held onto and iterated on across edits.
 * Behavior across edits depends on how it was anchored.
 */
interface TraitSection<TChild = TreeNode> extends Sequence<TChild, Place> {
	areInOrder(first: Place, second: Place): boolean;
}

// Note: other iterators are not assumed to be safe to use across edits (may be invalidated by edits)
// TODO: what do we do with invalid iterators? Throw recoverable error if used?
