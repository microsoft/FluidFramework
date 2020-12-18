/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from './Common';
import { Definition, NodeId } from './Identifiers';
import { Edit, Payload } from './PersistedTypes';
import { SnapshotNode, Snapshot } from './Snapshot';
import { BlobId, SharedTree, SharedTreeEvent } from './SharedTree';
import { initialTree } from './InitialTree';
import { Checkout } from './Checkout';

/**
 * This file assumes items are never removed from payloadCache.
 * Significant changes will be required if that is not true.
 */

/**
 * TODO:#48151: support reference payloads, and detect them here.
 */
function isReferencePayload(payload: Payload | undefined): boolean {
	return false;
}

/**
 * Filter which selects which nodes will be guaranteed to have their payloads available synchronously.
 * Returning `true` indicates that payloads of nodes with the provided definition must be provided synchronously and thus prefetched.
 * Returning `false` indicates that payloads of nodes with the provided definition must are allowed to be provided asynchronously
 * (not prefetched).
 *
 * # Why PrefetchFilter is passed a `Definition`
 *
 * The implementation of PrefetchingCheckout must handle invalidation of PrefetchFilter:
 * if a node is modified in such a way that PrefetchFilter could return a different result, PrefetchFilter must be rerun.
 * This constraint (having to be able to implement invalidation of PrefetchFilter results in PrefetchingCheckout)
 * would be difficult and inefficient to meet if PrefetchFilter could recurse down the tree.
 *
 * PrefetchFilter must however be passed enough information for the domain code to make an informed decision on if the payload should be
 * prefetched.
 * Fortunately, the known use case for this feature, deferred images,
 * has a domain policy about what to prefetch that can be implementable with only the definition:
 * no other data from the node is needed.
 *
 * Given that providing definitions is sufficient (at least for current use-cases),
 * and the other existing types we could provide (ex: Node, SnapshotNodes, NodeId)
 * would require complex and expensive invalidation, the decision was made to simply use `Definition`.
 */
type PrefetchFilter = (definition: Definition) => boolean;

class LoadedView {
	public readonly view: Snapshot;
	private readonly payloadCache: Map<BlobId, Payload>;
	private readonly prefetchFilter: PrefetchFilter;

	public static getInitialTree(prefetchFilter: PrefetchFilter, payloadCache: Map<BlobId, Payload>): LoadedView {
		return new LoadedView(Snapshot.fromTree(initialTree), payloadCache, prefetchFilter);
	}

	public constructor(view: Snapshot, payloadCache: Map<BlobId, Payload>, prefetchFilter: PrefetchFilter) {
		this.view = view;
		this.payloadCache = payloadCache;
		this.prefetchFilter = prefetchFilter;
	}

	public getPayload(node: SnapshotNode): Payload | undefined {
		const { payload } = node;
		// TODO:#48151: if reference payload, return it from payloadCache if present.
		return payload;
	}

	private getPayloadsToPrefetch(targetView: Snapshot): Payload[] {
		// Nodes which might have a new payload
		// TODO:#48151: Handle new nodes. As is, this will not include new nodes (only changed nodes):
		// either change delta's contract, or use another approach.
		const delta = this.view.delta(targetView);

		// Nodes which require payload prefetching
		const requirePayloads: NodeId[] = delta.filter((id) => {
			const node = targetView.getSnapshotNode(id);
			if (!isReferencePayload(node.payload)) {
				return false;
			}

			// TODO:#48151: return false if already in payloadCache.

			return this.prefetchFilter(node.definition);
		});
		return requirePayloads.map((id) => targetView.getSnapshotNode(id).payload ?? fail('payload should exist'));
	}

	public assertSynchronousLoadNext(view: Snapshot): LoadedView {
		const payloads = this.getPayloadsToPrefetch(view);
		assert(payloads.length === 0);

		return new LoadedView(view, this.payloadCache, this.prefetchFilter);
	}

	public async loadNext(view: Snapshot): Promise<LoadedView> {
		const payloads = this.getPayloadsToPrefetch(view);
		await Promise.all(payloads.map(() => fail('TODO: implement reference payload download')));
		return new LoadedView(view, this.payloadCache, this.prefetchFilter);
	}
}

/**
 * An Checkout that allows synchronous viewing and editing of the SharedTree by
 * prefetching content that needs to be downloaded asynchronously.
 *
 * TODO:#48151: support reference payloads. Until then the set of things actually pre-fetched is empty.
 *
 * @public
 * @sealed
 */
export class PrefetchingCheckout extends Checkout {
	/**
	 * The shared tree this checkout views/edits.
	 */
	public readonly tree: SharedTree;

	/**
	 * A revision newer than loadedView that is still loading.
	 */
	private loadingView?: Promise<LoadedView>;

	/**
	 * A revision which has finished loading.
	 */
	private loadedView: LoadedView;

	/**
	 * A bound handler for 'committedEdit' SharedTreeEvent
	 */
	private readonly editCommittedHandler = this.setLoadingView.bind(this);

	/**
	 * @param tree - the shared tree to view and edit.
	 * @param prefetchFilter - filter which selects which nodes (based on their definition)
	 * will be guaranteed to have their payloads available synchronously.
	 * @returns a new Checkout, reloaded with the current revision (at the time of calling) of `tree`.
	 * This checkout will continue to display updates from the tree as they come in.
	 */
	public static async load(
		tree: SharedTree,
		prefetchFilter: (node: Definition) => boolean
	): Promise<PrefetchingCheckout> {
		const loadedView = await LoadedView.getInitialTree(prefetchFilter, tree.payloadCache).loadNext(
			tree.currentView
		);
		return new PrefetchingCheckout(tree, loadedView);
	}

	/**
	 * @param tree - the tree
	 * @param loadedView - the view to start at
	 */
	private constructor(tree: SharedTree, loadedView: LoadedView) {
		super(loadedView.view);
		this.tree = tree;
		this.tree.on(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
		this.loadedView = loadedView;
	}

	protected get latestCommittedView(): Snapshot {
		return this.loadedView.view;
	}

	protected handleNewEdit(edit: Edit, view: Snapshot): void {
		// We want to avoid the case where the new edit show up (while in progress),
		// then disappears (because its not in loadedView yet),
		// then reappears (once loadedView is updated to include it).
		// Instead, show the output of the transaction until a revision from `tree` including edit is loaded.

		// Cancel the loading of any revision that might not include edit:
		// TODO: what about starvation? This policy could cause long chains of local edits to never have time to observe remote edits.
		if (this.loadingView !== undefined) {
			// TODO: Cancel inprogress work for loadingView instead of just leaving it running in the background.
			this.loadingView = undefined;
		}

		// Sse the output of the transaction as loadedView until a revision that includes edit is loaded.
		// TODO: what if this revision has payloads that have not been prefetched? (this will assert)
		this.loadedView = this.loadedView.assertSynchronousLoadNext(view);

		// Apply the edit: this will start loading a revision that includes edit.
		this.tree.processLocalEdit(edit);
	}

	public async waitForPendingUpdates(): Promise<void> {
		// Wait for edits that are already loading.
		await this.loadingView;
		// There may have been edits known at the beginning of this function that were not included in the pending batch.
		// Waiting for this second update is guaranteed to include at least all edits in the shared tree when this was called.
		await this.loadingView;
	}

	/**
	 * release all resources
	 */
	public dispose(): void {
		super.dispose();

		// remove registered listener
		this.tree.off(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
	}

	private setLoadingView(): void {
		if (this.loadingView === undefined) {
			const newView = this.tree.currentView;
			if (!newView.equals(this.loadedView.view)) {
				const loading = this.loadedView.loadNext(newView);
				this.loadingView = loading;
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this.loadingView.then((loaded) => {
					if (this.loadingView !== loading) {
						// Should have been canceled.
						// TODO: after supporting canceling, fail here?
						return;
					}

					this.loadedView = loaded;
					assert(newView === this.loadedView.view, 'expected view should be loaded');
					this.loadingView = undefined;
					// If there is an ongoing edit, emitChange will no-op, which is fine.
					this.emitChange();
					this.setLoadingView();
				});
			}
		}
	}
}
