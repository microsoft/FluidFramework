/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import {
	ChangeNode,
	convertTreeNodes,
	deepCloneStablePlace,
	deepCloneStableRange,
	Edit,
	EditLogSummarizer,
	GenericSharedTree,
	RevisionView,
	SharedTreeSummaryBase,
	SharedTreeSummaryWriteFormat,
} from '../generic';
import { copyPropertyIfDefined, fail } from '../Common';
import { DetachedSequenceId } from '../Identifiers';
import { ChangeInternal, ChangeTypeInternal, ConstraintInternal, DetachInternal } from './PersistedTypes';
import { SharedTreeFactory } from './Factory';
import { Transaction } from './Transaction';
import { getSummaryByVersion } from './Summary';
import { internalizeBuildNode, isDetachedSequenceId } from './EditUtilities';
import { revert } from './HistoryEditFactory';
import { BuildTreeNode, Change, ChangeType } from './ChangeTypes';

/**
 * A distributed tree.
 * @public
 * @sealed
 */
export class SharedTree extends GenericSharedTree<Change, ChangeInternal, Transaction.Failure> {
	/**
	 * Create a new SharedTree. It will contain the default value (see initialTree).
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedTree {
		return runtime.createChannel(id, SharedTreeFactory.Type) as SharedTree;
	}

	/**
	 * Get a factory for SharedTree to register with the data store.
	 * @param summarizeHistory - Determines if the history is included in summaries.
	 * @param writeSummaryFormat - Determines the format version the SharedTree will write summaries in.
	 * @param uploadEditChunks - Determines if edit chunks are uploaded when they are full.
	 * @returns A factory that creates `SharedTree`s and loads them from storage.
	 */
	public static getFactory(
		summarizeHistory = false,
		writeSummaryFormat = SharedTreeSummaryWriteFormat.Format_0_0_2,
		uploadEditChunks = false
	): SharedTreeFactory {
		return new SharedTreeFactory({
			summarizeHistory,
			writeSummaryFormat,
			uploadEditChunks,
		});
	}

	/**
	 * Create a new SharedTreeFactory.
	 * @param runtime - The runtime the SharedTree will be associated with
	 * @param id - Unique ID for the SharedTree
	 * @param expensiveValidation - enable expensive asserts
	 * @param summarizeHistory - Determines if the history is included in summaries.
	 * @param writeSummaryFormat - Determines the format version the SharedTree will write summaries in.
	 * @param uploadEditChunks - Determines if edit chunks are uploaded when they are full.
	 */
	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		expensiveValidation = false,
		summarizeHistory = true,
		writeSummaryFormat = SharedTreeSummaryWriteFormat.Format_0_0_2,
		uploadEditChunks = false
	) {
		super(
			runtime,
			id,
			Transaction.factory,
			SharedTreeFactory.Attributes,
			expensiveValidation,
			summarizeHistory,
			writeSummaryFormat,
			uploadEditChunks
		);
	}

	/**
	 * {@inheritDoc GenericSharedTree.revertChanges}
	 * @internal
	 */
	public revertChanges(changes: readonly ChangeInternal[], before: RevisionView): ChangeInternal[] | undefined {
		return revert(changes, before);
	}

	/**
	 * {@inheritDoc GenericSharedTree.generateSummary}
	 * @internal
	 */
	protected generateSummary(summarizeLog: EditLogSummarizer<ChangeInternal>): SharedTreeSummaryBase {
		try {
			return getSummaryByVersion(summarizeLog, this.currentView, this.summarizeHistory, this.writeSummaryFormat);
		} catch (error) {
			this.logger?.sendErrorEvent({
				eventName: 'UnsupportedSummaryWriteFormat',
				formatVersion: this.writeSummaryFormat,
			});
			throw error;
		}
	}

	/**
	 * {@inheritDoc GenericSharedTree.preprocessEdit}
	 * @internal
	 */
	protected preprocessEdit(edit: Edit<ChangeInternal>, _local: boolean): Edit<ChangeInternal> {
		// TODO:#70358: Generate IDs for remote builds
		return edit;
	}

	/**
	 * {@inheritDoc GenericSharedTree.internalizeChange}
	 * @internal
	 */
	public internalizeChange(change: Change): ChangeInternal {
		switch (change.type) {
			case ChangeType.Insert:
				return {
					source: change.source,
					destination: deepCloneStablePlace(change.destination),
					type: ChangeTypeInternal.Insert,
				};
			case ChangeType.Detach: {
				const detach: DetachInternal = {
					source: deepCloneStableRange(change.source),
					type: ChangeTypeInternal.Detach,
				};
				copyPropertyIfDefined(change, detach, 'destination');
				return detach;
			}
			case ChangeType.Build: {
				const source = change.source.map((buildNode) =>
					convertTreeNodes<BuildTreeNode, ChangeNode, DetachedSequenceId>(
						buildNode,
						(nodeData) => internalizeBuildNode(nodeData, this),
						isDetachedSequenceId
					)
				);
				return { source, destination: change.destination, type: ChangeTypeInternal.Build };
			}
			case ChangeType.SetValue:
				return {
					nodeToModify: change.nodeToModify,
					payload: change.payload,
					type: ChangeTypeInternal.SetValue,
				};
			case ChangeType.Constraint: {
				const constraint: ConstraintInternal = {
					effect: change.effect,
					toConstrain: deepCloneStableRange(change.toConstrain),
					type: ChangeTypeInternal.Constraint,
				};
				copyPropertyIfDefined(change, constraint, 'contentHash');
				copyPropertyIfDefined(change, constraint, 'identityHash');
				copyPropertyIfDefined(change, constraint, 'label');
				copyPropertyIfDefined(change, constraint, 'length');
				copyPropertyIfDefined(change, constraint, 'parentNode');
				return constraint;
			}
			default:
				fail('unexpected change type');
		}
	}
}
