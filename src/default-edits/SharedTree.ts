/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import { GenericSharedTree, SharedTreeSummaryBase, SharedTreeSummaryWriteFormat } from '../generic';
import { OrderedEditSet } from '../EditLog';
import { Change } from './PersistedTypes';
import { SharedTreeFactory } from './Factory';
import { Transaction } from './Transaction';
import { getSummaryByVersion } from './Summary';

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
	 * {@inheritDoc GenericSharedTree.generateSummary}
	 */
	protected generateSummary(editLog: OrderedEditSet<Change>): SharedTreeSummaryBase {
		try {
			return getSummaryByVersion(editLog, this.currentView, this.summarizeHistory, this.writeSummaryFormat);
		} catch (error) {
			this.logger?.sendErrorEvent({
				eventName: 'UnsupportedSummaryWriteFormat',
				formatVersion: this.writeSummaryFormat,
			});
			throw error;
		}
	}
}
