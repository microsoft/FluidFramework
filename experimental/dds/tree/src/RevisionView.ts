/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyPropertyIfDefined, fail, Mutable, MutableMap } from './Common';
import { Forest } from './Forest';
import { NodeId, StableNodeId, TraitLabel } from './Identifiers';
import { NodeIdConverter } from './NodeIdUtilities';
import { Payload, TreeNode, TreeNodeSequence } from './persisted-types';
import { TreeView, TreeViewNode, TreeViewPlace, TreeViewRange } from './TreeView';
import { HasVariadicTraits } from './ChangeTypes';

/**
 * An immutable view of a distributed tree.
 * @alpha
 */
export class RevisionView extends TreeView {
	/**
	 * Constructs a {@link RevisionView} using the supplied tree.
	 * @param root - the root of the tree to use as the contents of the {@link RevisionView}
	 * @param expensiveValidation - whether or not to perform additional validation, e.g. to catch errors when testing
	 */
	public static fromTree<T extends TreeNode<T, NodeId>>(root: T, expensiveValidation?: boolean): RevisionView;
	/**
	 * Constructs a {@link RevisionView} using the supplied tree.
	 * @param root - the root of the tree to use as the contents of the `RevisionView`
	 * @param idConverter - the {@link NodeIdConverter} that will recompress the IDs the in the tree
	 * @param expensiveValidation - whether or not to perform additional validation, e.g. to catch errors when testing
	 */
	public static fromTree<T extends TreeNode<T, StableNodeId>>(
		root: T,
		idConverter: NodeIdConverter,
		expensiveValidation?: boolean
	): RevisionView;

	public static fromTree<T extends TreeNode<T, NodeId> | TreeNode<T, StableNodeId>>(
		root: T,
		idConverterOrExpensiveValidation?: NodeIdConverter | boolean,
		expensiveValidation = false
	): RevisionView {
		if (typeof idConverterOrExpensiveValidation === 'object') {
			const rootId = idConverterOrExpensiveValidation.convertToNodeId(root.identifier as StableNodeId);

			const treeViewNodes = convertTreeNodesToViewNodes(root, (node) => {
				const identifier = idConverterOrExpensiveValidation.convertToNodeId(node.identifier as StableNodeId);
				const viewNode = {
					definition: node.definition,
					identifier,
				};
				copyPropertyIfDefined(node, viewNode, 'payload');
				return viewNode;
			});

			return new RevisionView(rootId, Forest.create(expensiveValidation).add(treeViewNodes));
		} else {
			return new RevisionView(
				root.identifier as NodeId,
				Forest.create(expensiveValidation).add(
					convertTreeNodesToViewNodes(root, (node) => {
						const viewNode = {
							definition: node.definition,
							identifier: node.identifier as NodeId,
						};
						copyPropertyIfDefined(node, viewNode, 'payload');
						return viewNode;
					})
				)
			);
		}
	}

	/** Begin a transaction by generating a mutable `TransactionView` from this view */
	public openForTransaction(): TransactionView {
		return new TransactionView(this.root, this.forest);
	}

	public equals(view: TreeView): boolean {
		if (!(view instanceof RevisionView)) {
			return false;
		}

		return this.hasEqualForest(view);
	}
}

/**
 * An view of a distributed tree that is part of an ongoing transaction between `RevisionView`s.
 * @alpha
 */
export class TransactionView extends TreeView {
	/** Conclude a transaction by generating an immutable `RevisionView` from this view */
	public close(): RevisionView {
		return new RevisionView(this.root, this.forest);
	}

	/** Inserts all nodes in a NodeSequence into the view */
	public addNodes(sequence: Iterable<TreeViewNode>): TransactionView {
		return new TransactionView(this.root, this.forest.add(sequence));
	}

	/** Remove all nodes with the given ids from the view */
	public deleteNodes(nodes: Iterable<NodeId>): TransactionView {
		return new TransactionView(this.root, this.forest.delete(nodes, true));
	}

	/**
	 * Parents a set of detached nodes at a specified place.
	 * @param nodesToAttach - the nodes to parent in the specified place. The nodes must already be present in the view.
	 * @param place - the location to insert the nodes.
	 */
	public attachRange(nodesToAttach: readonly NodeId[], place: TreeViewPlace): TransactionView {
		const { parent, label } = place.trait;
		const index = this.findIndexWithinTrait(place);
		return new TransactionView(this.root, this.forest.attachRangeOfChildren(parent, label, index, nodesToAttach));
	}

	/**
	 * Detaches a range of nodes from their parent. The detached nodes remain in the view.
	 * @param rangeToDetach - the range of nodes to detach
	 */
	public detachRange(rangeToDetach: TreeViewRange): { view: TransactionView; detached: readonly NodeId[] } {
		const { start, end } = rangeToDetach;
		const { trait: traitLocation } = start;
		const { parent, label } = traitLocation;
		const startIndex = this.findIndexWithinTrait(start);
		const endIndex = this.findIndexWithinTrait(end);
		const { forest, detached } = this.forest.detachRangeOfChildren(parent, label, startIndex, endIndex);
		return { view: new TransactionView(this.root, forest), detached };
	}

	/**
	 * Sets or overwrites a node's value. The node must exist in this view.
	 * @param nodeId - the id of the node
	 * @param value - the new value
	 */
	public setNodeValue(nodeId: NodeId, value: Payload): TransactionView {
		return new TransactionView(this.root, this.forest.setValue(nodeId, value));
	}

	public equals(view: TreeView): boolean {
		if (!(view instanceof TransactionView)) {
			return false;
		}

		return this.hasEqualForest(view);
	}
}

/**
 * Transform an input tree into a list of {@link TreeViewNode}s.
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each node in the input tree to produce the output nodes.
 * Returning undefined means that conversion for the given node was impossible, at which time the entire tree conversion will be aborted
 * and return undefined.
 */
export function convertTreeNodesToViewNodes<
	TIn extends HasVariadicTraits<TIn>,
	TOut extends TreeViewNode = TreeViewNode,
>(root: TIn, convert: (node: TIn) => Omit<TOut, 'traits'>): TOut[];

/**
 * Transform an input tree into a list of {@link TreeViewNode}s.
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each node in the input tree to produce the output nodes.
 */
export function convertTreeNodesToViewNodes<
	TIn extends HasVariadicTraits<TIn>,
	TOut extends TreeViewNode = TreeViewNode,
>(root: TIn, convert: (node: TIn) => Omit<TOut, 'traits'> | undefined): TOut[] | undefined;

/**
 * Transform an input tree into a list of {@link TreeViewNode}s.
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each node in the input tree to produce the output nodes.
 * Returning undefined means that conversion for the given node was impossible, at which time the entire tree conversion will be aborted
 * and return undefined.
 */
export function convertTreeNodesToViewNodes<
	TIn extends HasVariadicTraits<TIn>,
	TOut extends TreeViewNode = TreeViewNode,
>(root: TIn, convert: (node: TIn) => Omit<TOut, 'traits'> | undefined): TOut[] | undefined {
	const convertedRoot = convert(root) as Mutable<TOut>;
	if (convertedRoot === undefined || root.traits === undefined) {
		return undefined;
	}
	// `convertedRoot` might be the same as `root`, in which case stash the children of `root` before wiping them from `convertedRoot`
	const rootTraits = (root as unknown as TOut) === convertedRoot ? { traits: root.traits } : root;
	convertedRoot.traits = new Map();
	const pendingNodes: {
		childIterator: Iterator<[TraitLabel, TIn]>;
		newNode: Mutable<TOut>;
	}[] = [{ childIterator: iterateChildren(rootTraits)[Symbol.iterator](), newNode: convertedRoot }];
	const resultNodes: TOut[] = [];

	while (pendingNodes.length > 0) {
		const { childIterator, newNode } = pendingNodes[pendingNodes.length - 1] ?? fail('Undefined node');
		const { value, done } = childIterator.next();
		if (done === true) {
			resultNodes.push(
				pendingNodes.pop()?.newNode ?? fail('covertTreeNodesToViewNodes incorrectly coordinated parentage')
			);
		} else {
			const [traitLabel, child] = value as [TraitLabel, TIn];
			const convertedChild = convert(child) as TOut;
			if (convertedChild === undefined) {
				return undefined;
			}
			if (child.traits !== undefined) {
				const childTraits = (child as unknown as TOut) === convertedChild ? { traits: child.traits } : child;
				(convertedChild as Mutable<TOut>).traits = new Map();
				pendingNodes.push({
					childIterator: iterateChildren(childTraits)[Symbol.iterator](),
					newNode: convertedChild,
				});
			}

			const newTraits = newNode.traits as MutableMap<TOut['traits']>;
			let newTrait = newTraits.get(traitLabel);
			if (newTrait === undefined) {
				newTrait = [];
				newTraits.set(traitLabel, newTrait);
			}
			(newTrait as NodeId[]).push(convertedChild.identifier);
		}
	}

	return resultNodes;
}

/**
 * Returns an iterable of the supplied node's traits in a stable order.
 */
export function* iterateChildren<T>(hasTraits: HasVariadicTraits<T>): Iterable<[TraitLabel, T]> {
	if (hasTraits.traits !== undefined) {
		for (const [label, trait] of Object.entries(hasTraits.traits).sort()) {
			if (trait !== undefined) {
				if (isTreeNodeSequence(trait)) {
					for (const child of trait) {
						yield [label as TraitLabel, child];
					}
				} else {
					yield [label as TraitLabel, trait];
				}
			}
		}
	}
}

function isTreeNodeSequence<TChild>(sequence: TreeNodeSequence<TChild> | TChild): sequence is TreeNodeSequence<TChild> {
	return Array.isArray(sequence);
}
