/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import { EditId, NodeId } from '../Identifiers';
import { Snapshot } from '../Snapshot';
import { Edit, BuildNode, fullHistorySummarizer, GenericSharedTree, NodeData, SharedTreeSummaryBase } from '../generic';
import { OrderedEditSet } from '../EditLog';
import { Change, Delete, Insert, Move, StableRange, StablePlace } from './PersistedTypes';
import { SharedTreeFactory, SharedTreeFactoryNoHistory } from './Factory';
import * as HistoryEditFactory from './HistoryEditFactory';
import { Transaction } from './Transaction';
import { noHistorySummarizer } from './Summary';

/**
 * Wrapper around a `SharedTree` which provides ergonomic imperative editing functionality. All methods apply changes in their own edit.
 *
 * @example
 * // The following two lines of code are equivalent:
 * tree.applyEdit(...Insert.create([newNode], StablePlace.before(existingNode)));
 * tree.editor.insert(newNode, StablePlace.before(existingNode))
 * @public
 */
export class SharedTreeEditor {
	private readonly tree: SharedTree;

	public constructor(tree: SharedTree) {
		this.tree = tree;
	}

	/**
	 * Inserts a node at a location.
	 * @param node - Node to insert.
	 * @param destination - StablePlace at which the insert should take place.
	 */
	public insert(node: BuildNode, destination: StablePlace): EditId;
	/**
	 * Inserts nodes at a location.
	 * @param nodes - Nodes to insert.
	 * @param destination - StablePlace at which the insert should take place.
	 */
	public insert(nodes: BuildNode[], destination: StablePlace): EditId;
	public insert(nodeOrNodes: BuildNode | BuildNode[], destination: StablePlace): EditId {
		return this.tree.applyEdit(
			...Insert.create(Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes], destination)
		);
	}

	/**
	 * Moves a node to a specified location.
	 * @param source - Node to move.
	 * @param destination - StablePlace to which the node should be moved.
	 */
	public move(source: NodeData, destination: StablePlace): EditId;
	/**
	 * Moves a node to a specified location.
	 * @param source - Node to move.
	 * @param destination - StablePlace to which the node should be moved.
	 */
	public move(source: NodeId, destination: StablePlace): EditId;
	/**
	 * Moves a part of a trait to a specified location.
	 * @param source - Portion of a trait to move.
	 * @param destination - StablePlace to which the portion of the trait should be moved.
	 */
	public move(source: StableRange, destination: StablePlace): EditId;
	public move(source: NodeData | NodeId | StableRange, destination: StablePlace): EditId {
		if (!this.isStableRange(source)) {
			return this.tree.applyEdit(...Move.create(StableRange.only(source), destination));
		}

		return this.tree.applyEdit(...Move.create(source, destination));
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
	public delete(target: NodeId): EditId;
	/**
	 * Deletes a portion of a trait.
	 * @param target - Range of nodes to delete, specified as a `StableRange`
	 */
	public delete(target: StableRange): EditId;
	public delete(target: NodeData | NodeId | StableRange): EditId {
		if (!this.isStableRange(target)) {
			return this.tree.applyEdit(Delete.create(StableRange.only(target)));
		}

		return this.tree.applyEdit(Delete.create(target));
	}

	/**
	 * Reverts a previous edit.
	 * @param edit - the edit to revert
	 * @param view - the revision to which the edit is applied (not the output of applying edit: it's the one just before that)
	 */
	public revert(edit: Edit<Change>, view: Snapshot): EditId {
		return this.tree.applyEdit(...HistoryEditFactory.revert(edit.changes, view));
	}

	private isStableRange(source: NodeData | NodeId | StableRange): source is StableRange {
		return (source as StableRange).start !== undefined && (source as StableRange).end !== undefined;
	}
}

/**
 * A distributed tree.
 * @public
 * @sealed
 */
export class SharedTree extends GenericSharedTree<Change> {
	/**
	 * Create a new SharedTree. It will contain the default value (see initialTree).
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedTree {
		return runtime.createChannel(id, SharedTreeFactory.Type) as SharedTree;
	}

	/**
	 * Get a factory for SharedTree to register with the data store.
	 * @param historySummarizing - determines how history is summarized by the returned `SharedTree`.
	 * @returns A factory that creates `SharedTree`s and loads them from storage.
	 */
	public static getFactory(summarizeHistory = true): SharedTreeFactory {
		return summarizeHistory ? new SharedTreeFactory() : new SharedTreeFactoryNoHistory();
	}

	/**
	 * Create a new SharedTreeFactory.
	 * @param runtime - The runtime the SharedTree will be associated with
	 * @param id - Unique ID for the SharedTree
	 * @param expensiveValidation - enable expensive asserts
	 * @param summarizeHistory - Determines if the history is included in summaries.
	 */
	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		expensiveValidation = false,
		summarizeHistory = true
	) {
		super(runtime, id, Transaction.factory, SharedTreeFactory.Attributes, expensiveValidation, summarizeHistory);
	}

	private _editor: SharedTreeEditor | undefined;

	/**
	 * Returns a `SharedTreeEditor` for editing this tree in an imperative fashion. All edits are performed on the current tree view.
	 */
	public get editor(): SharedTreeEditor {
		if (!this._editor) {
			this._editor = new SharedTreeEditor(this);
		}

		return this._editor;
	}

	/**
	 * {@inheritDoc GenericSharedTree.generateSummary}
	 */
	protected generateSummary(editLog: OrderedEditSet<Change>): SharedTreeSummaryBase {
		if (!this.summarizeHistory) {
			return noHistorySummarizer(editLog, this.currentView);
		}
		return fullHistorySummarizer(editLog, this.currentView);
	}
}
