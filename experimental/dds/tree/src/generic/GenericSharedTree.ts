/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from '@fluidframework/common-utils';
import { IFluidHandle, IFluidSerializer } from '@fluidframework/core-interfaces';
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from '@fluidframework/protocol-definitions';
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelAttributes,
} from '@fluidframework/datastore-definitions';
import { AttachState } from '@fluidframework/container-definitions';
import { ISharedObjectEvents, serializeHandles, SharedObject } from '@fluidframework/shared-object-base';
import { ITelemetryLogger } from '@fluidframework/common-definitions';
import { ChildLogger, ITelemetryLoggerPropertyBags, PerformanceEvent } from '@fluidframework/telemetry-utils';
import { assert, assertNotUndefined, fail } from '../Common';
import { EditLog, OrderedEditSet } from '../EditLog';
import { EditId } from '../Identifiers';
import { Snapshot } from '../Snapshot';
import { initialTree } from '../InitialTree';
import { CachingLogViewer, EditStatusCallback, LogViewer } from '../LogViewer';
import { convertSummaryToReadFormat, deserialize, readFormatVersion } from '../SummaryBackCompatibility';
import {
	Edit,
	SharedTreeOpType,
	SharedTreeEditOp,
	SharedTreeHandleOp,
	EditWithoutId,
	SharedTreeOp,
	EditStatus,
} from './PersistedTypes';
import { serialize, SharedTreeSummarizer, SharedTreeSummary, SharedTreeSummaryBase } from './Summary';
import { GenericTransaction } from './GenericTransaction';
import { newEdit } from './GenericEditUtilities';

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = 'header';

const initialSummary: SharedTreeSummary<unknown> = {
	version: readFormatVersion,
	currentTree: initialTree,
	editHistory: {
		editChunks: [],
		editIds: [],
	},
};

/**
 * An event emitted by a `SharedTree` to indicate a state change. See {@link ISharedTreeEvents} for event argument information.
 * @public
 */
export enum SharedTreeEvent {
	/**
	 * An edit has been committed to the log.
	 * This happens when either:
	 * 	1. A locally generated edit is added to the log.
	 * 	2. A remotely generated edit is added to the log.
	 * Note that, for locally generated edits, this event will not be emitted again when that edit is sequenced.
	 * Passed the EditId of the committed edit, i.e. supports callbacks of type {@link EditCommittedHandler}.
	 */
	EditCommitted = 'committedEdit',
}

/**
 * An event emitted by a `SharedTree` for diagnostic purposes.
 * See {@link ISharedTreeEvents} for event argument information.
 */
export enum SharedTreeDiagnosticEvent {
	/**
	 * A single catch up blob has been uploaded.
	 */
	CatchUpBlobUploaded = 'uploadedCatchUpBlob',
	/**
	 * A valid edit (local or remote) has been applied.
	 * Passed the EditId of the applied edit.
	 * Note that this may be called multiple times, due to concurrent edits causing reordering,
	 * and/or due to not caching the output of every edit.
	 */
	AppliedEdit = 'appliedEdit',
	/**
	 * An invalid edit (local or remote) has been dropped.
	 * Passed the EditId of the dropped edit.
	 * Note that this may be called multiple times, due to concurrent edits causing reordering,
	 * and/or due to not caching the output of every edit.
	 */
	DroppedInvalidEdit = 'droppedInvalidEdit',
	/**
	 * A malformed edit (local or remote) has been dropped.
	 * Passed the EditId of the dropped edit.
	 * Note that this may be called multiple times, due to concurrent edits causing reordering,
	 * and/or due to not caching the output of every edit.
	 */
	DroppedMalformedEdit = 'droppedMalformedEdit',
}

/**
 * The arguments included when the EditCommitted SharedTreeEvent is emitted.
 * @public
 */
export interface EditCommittedEventArguments<TSharedTree> {
	/** The ID of the edit committed. */
	editId: EditId;
	/** Whether or not this is a local edit. */
	local: boolean;
	/** The tree the edit was committed on. Required for local edit events handled by SharedTreeUndoRedoHandler. */
	tree: TSharedTree;
}

/**
 * Events which may be emitted by `SharedTree`. See {@link SharedTreeEvent} for documentation of event semantics.
 */
export interface ISharedTreeEvents<TSharedTree> extends ISharedObjectEvents {
	(event: 'committedEdit', listener: EditCommittedHandler<TSharedTree>);
}

/**
 * Expected type for a handler of the `EditCommitted` event.
 */
export type EditCommittedHandler<TSharedTree> = (args: EditCommittedEventArguments<TSharedTree>) => void;

const sharedTreeTelemetryProperties: ITelemetryLoggerPropertyBags = { all: { isSharedTreeEvent: true } };

/**
 * A distributed tree.
 * @public
 */
export abstract class GenericSharedTree<TChange> extends SharedObject<ISharedTreeEvents<TChange>> {
	/**
	 * The log of completed edits for this SharedTree.
	 */
	private editLog: EditLog<TChange>;

	/**
	 * As an implementation detail, SharedTree uses a log viewer that caches snapshots at different revisions.
	 * It is not exposed to avoid accidental correctness issues, but `logViewer` is exposed in order to give clients a way
	 * to access the revision history.
	 */
	private cachingLogViewer: CachingLogViewer<TChange>;

	/**
	 * Viewer for trees defined by editLog. This allows access to views of the tree at different revisions (various points in time).
	 */
	public get logViewer(): LogViewer {
		return this.cachingLogViewer;
	}

	protected readonly logger: ITelemetryLogger;

	public readonly transactionFactory: (snapshot: Snapshot) => GenericTransaction<TChange>;

	/** Indicates if the client is the oldest member of the quorum. */
	private currentIsOldest: boolean;

	private readonly processEditResult = (editResult: EditStatus, editId: EditId): void => {
		// TODO:#44859: Invalid results should be handled by the app
		this.emit(GenericSharedTree.eventFromEditResult(editResult), editId);
	};

	/**
	 * Create a new SharedTreeFactory.
	 * @param runtime - The runtime the SharedTree will be associated with
	 * @param id - Unique ID for the SharedTree
	 * @param expensiveValidation - Enable expensive asserts.
	 * @param summarizeHistory - Determines if the history is included in summaries.
	 */
	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		transactionFactory: (snapshot: Snapshot) => GenericTransaction<TChange>,
		attributes: IChannelAttributes,
		private readonly expensiveValidation = false,
		protected readonly summarizeHistory = true
	) {
		super(id, runtime, attributes);
		this.expensiveValidation = expensiveValidation;
		this.transactionFactory = transactionFactory;

		// This code is somewhat duplicated from OldestClientObserver because it currently depends on the container runtime
		// which SharedTree does not have access to.
		// TODO:#55900: Get rid of copy-pasted OldestClientObserver code
		const quorum = this.runtime.getQuorum();
		this.currentIsOldest = this.computeIsOldest();
		quorum.on('addMember', this.updateOldest);
		quorum.on('removeMember', this.updateOldest);
		runtime.on('connected', this.updateOldest);
		runtime.on('disconnected', this.updateOldest);

		this.logger = ChildLogger.create(runtime.logger, 'SharedTree', sharedTreeTelemetryProperties);
		const { editLog, cachingLogViewer } = this.createEditLogFromSummary(initialSummary, this.processEditResult);

		this.editLog = editLog;
		this.cachingLogViewer = cachingLogViewer;
	}

	/**
	 * Re-computes currentIsOldest and emits an event if it has changed.
	 * TODO:#55900: Get rid of copy-pasted OldestClientObserver code
	 */
	private readonly updateOldest = () => {
		const oldest = this.computeIsOldest();
		if (this.currentIsOldest !== oldest) {
			this.currentIsOldest = oldest;
			if (oldest) {
				this.emit('becameOldest');
			} else {
				this.emit('lostOldest');
			}
		}
	};

	/**
	 * Computes the oldest client in the quorum, true by default if the container is detached and false by default if the client isn't connected.
	 * TODO:#55900: Get rid of copy-pasted OldestClientObserver code
	 */
	private computeIsOldest(): boolean {
		// If the container is detached, we are the only ones that know about it and are the oldest by default.
		if (this.runtime.attachState === AttachState.Detached) {
			return true;
		}

		// If we're not connected we can't be the oldest connected client.
		if (!this.runtime.connected) {
			return false;
		}

		assert(this.runtime.clientId !== undefined, 'Client id should be set if connected.');

		const quorum = this.runtime.getQuorum();
		const selfSequencedClient = quorum.getMember(this.runtime.clientId);
		// When in readonly mode our clientId will not be present in the quorum.
		if (selfSequencedClient === undefined) {
			return false;
		}

		const members = quorum.getMembers();
		for (const sequencedClient of members.values()) {
			if (sequencedClient.sequenceNumber < selfSequencedClient.sequenceNumber) {
				return false;
			}
		}

		// No member of the quorum was older
		return true;
	}

	/**
	 * @returns the current view of the tree.
	 */
	public get currentView(): Snapshot {
		return this.logViewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
	}

	/**
	 * @returns the edit history of the tree.
	 */
	public get edits(): OrderedEditSet<TChange> {
		return this.editLog;
	}

	/**
	 * Convenience helper for applying an edit containing the given changes.
	 * Opens an edit, applies the given changes, and closes the edit. See (`openEdit()`/`applyChanges()`/`closeEdit()`).
	 *
	 * For convenient imperative variants of edits, see `editor`.
	 * @internal
	 */
	public applyEdit(...changes: TChange[]): EditId {
		const edit = newEdit(changes);
		this.processLocalEdit(edit);
		return edit.id;
	}

	private deserializeHandle(serializedHandle: string): IFluidHandle<ArrayBufferLike> {
		const deserializeHandle = this.serializer.parse(serializedHandle);
		assert(typeof deserializeHandle === 'object');
		return deserializeHandle as IFluidHandle<ArrayBufferLike>;
	}

	/**
	 * Uploads the edit chunk and sends the chunk starting revision along with the resulting handle as an op.
	 */
	private async uploadEditChunk(edits: readonly EditWithoutId<TChange>[], startRevision: number): Promise<void> {
		try {
			const editHandle = await this.runtime.uploadBlob(IsoBuffer.from(JSON.stringify({ edits })));
			this.submitLocalMessage({
				editHandle: serializeHandles(editHandle, this.serializer, this.handle),
				startRevision,
				type: SharedTreeOpType.Handle,
			});
		} catch (error) {
			// If chunk load fails, we will try again later in loadCore on the oldest client so we log the error instead of throwing.
			this.logger.sendErrorEvent(
				{
					eventName: 'EditChunkUploadFailure',
				},
				error
			);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.snapshotCore}
	 */
	public snapshotCore(serializer: IFluidSerializer): ITree {
		const tree: ITree = {
			entries: [
				{
					mode: FileMode.File,
					path: snapshotFileName,
					type: TreeEntry[TreeEntry.Blob],
					value: {
						contents: this.saveSerializedSummary({ serializer }),
						encoding: 'utf-8',
					},
				},
			],
		};

		return tree;
	}

	/**
	 * Saves this SharedTree into a serialized summary.
	 *
	 * @param options - Optional serializer and summarizer to use. If not passed in, SharedTree's serializer and summarizer are used.
	 * @internal
	 */
	public saveSerializedSummary(options?: {
		serializer?: IFluidSerializer;
		summarizer?: SharedTreeSummarizer<TChange>;
	}): string {
		const { serializer, summarizer } = options || {};

		return serialize(
			summarizer ? summarizer(this.editLog, this.currentView) : this.saveSummary(),
			serializer || this.serializer,
			this.handle
		);
	}

	/**
	 * Saves this SharedTree into a summary.
	 * @internal
	 */
	public saveSummary(): SharedTreeSummaryBase {
		// If local changes exist, emulate the sequencing of those changes.
		// Doing so is necessary so edits created during DataObject.initializingFirstTime are included.
		// Doing so is safe because it is guaranteed that the DDS has not yet been attached. This is because summary creation is only
		// ever invoked on a DataObject containing local changes when it is attached for the first time. In post-attach flows, an extra
		// instance of the DataObject is created for generating summaries and will never have local edits.
		if (this.editLog.numberOfLocalEdits > 0) {
			assert(
				this.runtime.attachState !== AttachState.Attached,
				'Summarizing should not occur with local edits except on first attach.'
			);
			this.editLog.sequenceLocalEdits();
		}

		assert(this.editLog.numberOfLocalEdits === 0, 'generateSummary must not be called with local edits');
		return this.generateSummary(this.editLog);
	}

	/**
	 * Generates a SharedTree summary for the current state of the tree.
	 * Will never be called when local edits are present.
	 */
	protected abstract generateSummary(editLog: OrderedEditSet<TChange>): SharedTreeSummaryBase;

	/**
	 * Initialize shared tree with a summary.
	 * @internal
	 */
	public loadSummary(summary: SharedTreeSummaryBase): void {
		const { editLog, cachingLogViewer } = this.createEditLogFromSummary(summary, this.processEditResult);
		this.editLog = editLog;
		this.cachingLogViewer = cachingLogViewer;

		if (this.runtime.connected) {
			const noChunksReadyForUpload = this.editLog.getEditChunksReadyForUpload()[Symbol.iterator]().next().done;
			if (noChunksReadyForUpload === undefined || !noChunksReadyForUpload) {
				// A client does not become a member of the quorum until it is within the collaboration window.
				//
				// The collaboration window is the range from the minimum sequence number enforced by the server and head.
				// When a client sends an op, they include the last sequence number the client has processed. We call this the reference
				// sequence number.
				//
				// If there are no members in the quorum, we send a no op op in order to have this client added as a member to the quorum.
				// This is required so we can ensure only the oldest client will upload blobs during summary load.
				if (this.runtime.getQuorum().getMembers().size === 0) {
					const noop: SharedTreeOp = {
						type: SharedTreeOpType.NoOp,
					};

					this.submitLocalMessage(noop);
				} else if (this.currentIsOldest) {
					void this.uploadCatchUpBlobs();
				}
			}

			// If this client becomes the oldest, it should take care of uploading catch up blobs.
			this.on('becameOldest', () => void this.uploadCatchUpBlobs());
		}
	}

	private static eventFromEditResult(editStatus: EditStatus): SharedTreeDiagnosticEvent {
		switch (editStatus) {
			case EditStatus.Applied:
				return SharedTreeDiagnosticEvent.AppliedEdit;
			case EditStatus.Invalid:
				return SharedTreeDiagnosticEvent.DroppedInvalidEdit;
			default:
				return SharedTreeDiagnosticEvent.DroppedMalformedEdit;
		}
	}

	private createEditLogFromSummary(
		summary: SharedTreeSummaryBase,
		callback: EditStatusCallback
	): { editLog: EditLog<TChange>; cachingLogViewer: CachingLogViewer<TChange> } {
		const convertedSummary = convertSummaryToReadFormat<TChange>(summary);
		if (typeof convertedSummary === 'string') {
			fail(convertedSummary);
		}
		const { editHistory, currentTree } = convertedSummary;
		const currentView = Snapshot.fromTree(currentTree);

		const editLog = new EditLog(editHistory, this.logger);
		const logViewer = new CachingLogViewer(
			editLog,
			Snapshot.fromTree(initialTree),
			// TODO:#47830: Store multiple checkpoints in summary.
			[[editLog.length, { snapshot: currentView }]],
			this.expensiveValidation,
			callback,
			this.logger,
			this.transactionFactory,
			0
		);

		return { editLog, cachingLogViewer: logViewer };
	}

	/**
	 * Upload any full chunks that have yet to be uploaded.
	 */
	private async uploadCatchUpBlobs(): Promise<void> {
		for (const [startRevision, chunk] of this.editLog.getEditChunksReadyForUpload()) {
			await this.uploadEditChunk(chunk, startRevision);
			this.emit(SharedTreeDiagnosticEvent.CatchUpBlobUploaded);
		}
	}

	/**
	 * Compares this shared tree to another for equality.
	 *
	 * Equality means that the histories as captured by the EditLogs are equal.
	 *
	 * Equality does not include:
	 *   - if an edit is open
	 *   - the shared tree's id
	 *   - local vs sequenced status of edits
	 *   - registered event listeners
	 *   - state of caches
	 * */
	public equals<TOtherChangeTypes>(sharedTree: GenericSharedTree<TOtherChangeTypes>): boolean {
		if (!this.currentView.equals(sharedTree.currentView)) {
			return false;
		}

		return this.editLog.equals(sharedTree.editLog);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const summaryLoadPerformanceEvent = PerformanceEvent.start(this.logger, { eventName: 'SummaryLoad' });

		try {
			const newBlob = await storage.readBlob(snapshotFileName);
			const blobData = bufferToString(newBlob, 'utf8');

			const summary = deserialize(blobData, this.serializer);
			if (typeof summary === 'string') {
				fail(summary);
			}
			this.loadSummary(summary);

			summaryLoadPerformanceEvent.end({ historySize: this.edits.length });
		} catch (error) {
			summaryLoadPerformanceEvent.cancel(undefined, error);
			throw error;
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(message: ISequencedDocumentMessage, local: boolean): void {
		this.cachingLogViewer.setMinimumSequenceNumber(message.minimumSequenceNumber);
		const { type } = message.contents;
		if (type === SharedTreeOpType.Handle) {
			const { editHandle, startRevision } = message.contents as SharedTreeHandleOp;
			this.editLog.processEditChunkHandle(this.deserializeHandle(editHandle), startRevision);
		} else if (type === SharedTreeOpType.Edit) {
			const semiSerializedEdit = message.contents.edit;
			// semiSerializedEdit may have handles which have been replaced by `serializer.replaceHandles`.
			// Since there is no API to un-replace them except via parse, re-stringify the edit, then parse it.
			// Stringify using JSON, not IFluidSerializer since OPs use JSON directly.
			// TODO:Performance:#48025: Avoid this serialization round trip.
			const stringEdit = JSON.stringify(semiSerializedEdit);
			const parsedEdit = this.serializer.parse(stringEdit);
			const edit = parsedEdit as Edit<TChange>;
			this.processSequencedEdit(edit, message);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.registerCore}
	 */
	protected registerCore(): void {
		// Do nothing
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect(): void {
		// Do nothing
	}

	private processSequencedEdit(edit: Edit<TChange>, message: ISequencedDocumentMessage): void {
		const { id: editId } = edit;
		const wasLocalEdit = this.editLog.isLocalEdit(editId);

		// If the id of the supplied edit matches a non-local edit already present in the log, this would normally be indicative of an error.
		// However, the @fluidframework packages prior to 0.37.x have a bug which can cause data corruption by sequencing duplicate edits--
		// see discussion on the following github issue: https://github.com/microsoft/FluidFramework/issues/4399
		// To work around this issue, we currently tolerate duplicate ops in loaded documents.
		// This could be strengthened in the future to only apply to documents which may have been impacted.
		const shouldIgnoreEdit = this.editLog.tryGetIndexOfId(editId) !== undefined && !wasLocalEdit;
		if (shouldIgnoreEdit) {
			return;
		}

		this.editLog.addSequencedEdit(edit, message);
		if (!wasLocalEdit) {
			const eventArguments: EditCommittedEventArguments<GenericSharedTree<TChange>> = {
				editId,
				local: false,
				tree: this,
			};
			this.emit(SharedTreeEvent.EditCommitted, eventArguments);
		} else {
			// If this client created the edit that filled up a chunk, it is responsible for uploading that chunk.
			const lastPair = this.editLog.getLastEditChunk();
			if (lastPair !== undefined) {
				const [startRevision, chunk] = lastPair;
				const edits = assertNotUndefined(chunk.edits);
				if (edits.length === this.editLog.editsPerChunk) {
					void this.uploadEditChunk(edits, startRevision);
				}
			}
		}
	}

	/**
	 * Add an `Edit` directly.
	 * External users should use one of the more specialized functions, like applyEdit which handles constructing the actual `Edit` object.
	 * This is exposed as it is useful for testing, particularly with invalid and malformed Edits.
	 * @internal
	 */
	public processLocalEdit(edit: Edit<TChange>): void {
		const editOp: SharedTreeEditOp<TChange> = {
			type: SharedTreeOpType.Edit,
			edit,
		};

		// IFluidHandles are not allowed in Ops.
		// Ops can contain Fluid's Serializable (for payloads) which allows IFluidHandles.
		// So replace the handles before sending:
		const semiSerialized = this.serializer.replaceHandles(editOp, this.handle);

		// TODO:44711: what should be passed in when unattached?
		this.submitLocalMessage(semiSerialized);
		this.editLog.addLocalEdit(edit);

		const eventArguments: EditCommittedEventArguments<GenericSharedTree<TChange>> = {
			editId: edit.id,
			local: true,
			tree: this,
		};
		this.emit(SharedTreeEvent.EditCommitted, eventArguments);
	}

	public getRuntime(): IFluidDataStoreRuntime {
		return this.runtime;
	}

	protected applyStashedOp() {
		throw new Error('not implemented');
	}
}
