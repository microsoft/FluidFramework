/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import { EditId } from '../Identifiers';
import { Snapshot } from '../Snapshot';
import { Edit, BuildNode, fullHistorySummarizer, GenericSharedTree, NodeData, SharedTreeSummaryBase } from '../generic';
import { OrderedEditSet } from '../EditLog';
import { noHistorySummarizer, revert } from '../default-edits';
import {
	AnchoredChange,
	AnchoredDelete,
	AnchoredInsert,
	AnchoredMove,
	RangeAnchor,
	PlaceAnchor,
	NodeAnchor,
} from './PersistedTypes';
import { SharedTreeWithAnchorsFactory } from './Factory';
import { TransactionWithAnchors } from './TransactionWithAnchors';

/**
 * Wrapper around a `SharedTreeWithAnchorsEditor` which provides ergonomic imperative editing functionality. All methods apply changes in
 * their own edit.
 *
 * @example
 * // The following two lines of code are equivalent:
 * tree.applyEdit(...AnchoredInsert.create([newNode], PlaceAnchor.before(existingNode)));
 * tree.editor.insert(newNode, PlaceAnchor.before(existingNode))
 * @public
 */
export class SharedTreeWithAnchorsEditor {
	private readonly tree: SharedTreeWithAnchors;

	public constructor(tree: SharedTreeWithAnchors) {
		this.tree = tree;
	}

	/**
	 * Inserts a node at a location.
	 * @param node - Node to insert.
	 * @param destination - PlaceAnchor at which the insert should take place.
	 */
	public insert(node: BuildNode, destination: PlaceAnchor): EditId;
	/**
	 * Inserts nodes at a location.
	 * @param nodes - Nodes to insert.
	 * @param destination - PlaceAnchor at which the insert should take place.
	 */
	public insert(nodes: BuildNode[], destination: PlaceAnchor): EditId;
	public insert(nodeOrNodes: BuildNode | BuildNode[], destination: PlaceAnchor): EditId {
		return this.tree.applyEdit(
			...AnchoredInsert.create(Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes], destination)
		);
	}

	/**
	 * Moves a node to a specified location.
	 * @param source - Node to move.
	 * @param destination - PlaceAnchor to which the node should be moved.
	 */
	public move(source: NodeData, destination: PlaceAnchor): EditId;
	/**
	 * Moves a node to a specified location.
	 * @param source - Node to move.
	 * @param destination - PlaceAnchor to which the node should be moved.
	 */
	public move(source: NodeAnchor, destination: PlaceAnchor): EditId;
	/**
	 * Moves a part of a trait to a specified location.
	 * @param source - Portion of a trait to move.
	 * @param destination - PlaceAnchor to which the portion of the trait should be moved.
	 */
	public move(source: RangeAnchor, destination: PlaceAnchor): EditId;
	public move(source: NodeData | NodeAnchor | RangeAnchor, destination: PlaceAnchor): EditId {
		if (!this.isRange(source)) {
			return this.tree.applyEdit(...AnchoredMove.create(RangeAnchor.only(source), destination));
		}

		return this.tree.applyEdit(...AnchoredMove.create(source, destination));
	}

	/**
	 * Deletes a node.
	 * @param target - Node to delete
	 */
	public delete(target: NodeData): EditId;
	/**
	 * Deletes a node.
	 * @param target - Node to delete
	 */
	public delete(target: NodeAnchor): EditId;
	/**
	 * Deletes a portion of a trait.
	 * @param target - Range of nodes to delete, specified as a `RangeAnchor`
	 */
	public delete(target: RangeAnchor): EditId;
	public delete(target: NodeData | NodeAnchor | RangeAnchor): EditId {
		if (!this.isRange(target)) {
			return this.tree.applyEdit(AnchoredDelete.create(RangeAnchor.only(target)));
		}

		return this.tree.applyEdit(AnchoredDelete.create(target));
	}

	/**
	 * Reverts a previous edit.
	 * @param edit - the edit to revert
	 * @param view - the revision to which the edit is applied (not the output of applying edit: it's the one just before that)
	 */
	public revert(edit: Edit<AnchoredChange>, view: Snapshot): EditId {
		return this.tree.applyEdit(...revert(edit.changes, view));
	}

	public applyChanges(changes: readonly AnchoredChange[]): EditId {
		return this.tree.applyEdit(...changes);
	}

	private isRange(source: NodeData | NodeAnchor | RangeAnchor): source is RangeAnchor {
		return (source as RangeAnchor).start !== undefined && (source as RangeAnchor).end !== undefined;
	}
}

/**
 * A distributed tree.
 *
 * Does not currently guarantee convergence among nodes. This is due to the fact that the current summary information is insufficient to
 * ensure that all nodes have access to all the relevant data for the application of a given edit. For example, if edit was sequenced after
 * a given summary but references an edit before that summary then nodes that do not have that earlier edit's information in memory will not
 * have the full context for the application of the change. This currently leads to a "best effort" application which takes into account
 * whatever data is available. Remedying this is tracked by #57176.
 *
 * @public
 * @sealed
 */
export class SharedTreeWithAnchors extends GenericSharedTree<AnchoredChange> {
	/**
	 * Create a new SharedTreeWithAnchors. It will contain the default value (see initialTree).
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedTreeWithAnchors {
		return runtime.createChannel(id, SharedTreeWithAnchorsFactory.Type) as SharedTreeWithAnchors;
	}

	/**
	 * Get a factory for SharedTreeWithAnchors to register with the data store.
	 * @returns A factory that creates `SharedTreeWithAnchors`s and loads them from storage.
	 */
	public static getFactory(): SharedTreeWithAnchorsFactory {
		return new SharedTreeWithAnchorsFactory();
	}

	/**
	 * Create a new SharedTreeFactory.
	 * @param runtime - The runtime the SharedTreeWithAnchors will be associated with
	 * @param id - Unique ID for the SharedTreeWithAnchors
	 * @param expensiveValidation - enable expensive asserts
	 */
	public constructor(runtime: IFluidDataStoreRuntime, id: string, expensiveValidation = false) {
		super(
			runtime,
			id,
			TransactionWithAnchors.factory,
			SharedTreeWithAnchorsFactory.Attributes,
			expensiveValidation
		);
	}

	private _editor: SharedTreeWithAnchorsEditor | undefined;

	/**
	 * Returns a `SharedTreeEditor` for editing this tree in an imperative fashion. All edits are performed on the current tree view.
	 */
	public get editor(): SharedTreeWithAnchorsEditor {
		if (!this._editor) {
			this._editor = new SharedTreeWithAnchorsEditor(this);
		}

		return this._editor;
	}

	/**
	 * {@inheritDoc GenericSharedTree.generateSummary}
	 */
	protected generateSummary(editLog: OrderedEditSet<AnchoredChange>): SharedTreeSummaryBase {
		if (this.summarizeHistory) {
			return fullHistorySummarizer(editLog, this.currentView);
		}

		return noHistorySummarizer(editLog, this.currentView);
	}
}
