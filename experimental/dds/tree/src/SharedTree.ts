/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from '@fluid-internal/client-utils';
import { AttachState } from '@fluidframework/container-definitions';
import { ITelemetryBaseProperties } from '@fluidframework/core-interfaces';
import { assert } from '@fluidframework/core-utils/internal';
import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from '@fluidframework/datastore-definitions/internal';
import { ISequencedDocumentMessage } from '@fluidframework/driver-definitions/internal';
import { ISummaryTreeWithStats, ITelemetryContext } from '@fluidframework/runtime-definitions/internal';
import {
	IFluidSerializer,
	ISharedObjectEvents,
	SharedObject,
	createSingleBlobSummary,
} from '@fluidframework/shared-object-base/internal';
import {
	IEventSampler,
	ITelemetryLoggerPropertyBags,
	ITelemetryLoggerExt,
	PerformanceEvent,
	createChildLogger,
	createSampledLogger,
} from '@fluidframework/telemetry-utils/internal';

import { BuildNode, BuildTreeNode, Change, ChangeType } from './ChangeTypes.js';
import { RestOrArray, copyPropertyIfDefined, fail, unwrapRestOrArray } from './Common.js';
import { EditHandle, EditLog, OrderedEditSet } from './EditLog.js';
import {
	areRevisionViewsSemanticallyEqual,
	convertTreeNodes,
	deepCloneStablePlace,
	deepCloneStableRange,
	internalizeBuildNode,
	newEditId,
	walkTree,
} from './EditUtilities.js';
import { SharedTreeDiagnosticEvent, SharedTreeEvent } from './EventTypes.js';
import { revert } from './HistoryEditFactory.js';
import { convertEditIds } from './IdConversion.js';
import {
	AttributionId,
	DetachedSequenceId,
	EditId,
	NodeId,
	OpSpaceNodeId,
	SessionId,
	StableNodeId,
	isDetachedSequenceId,
} from './Identifiers.js';
import { initialTree } from './InitialTree.js';
import {
	CachingLogViewer,
	EditCacheEntry,
	EditStatusCallback,
	LogViewer,
	SequencedEditResult,
	SequencedEditResultCallback,
} from './LogViewer.js';
import { NodeIdContext, NodeIdNormalizer, getNodeIdContext } from './NodeIdUtilities.js';
import { ReconciliationPath } from './ReconciliationPath.js';
import { RevisionView } from './RevisionView.js';
import { SharedTreeEncoder_0_0_2, SharedTreeEncoder_0_1_1 } from './SharedTreeEncoder.js';
import { MutableStringInterner } from './StringInterner.js';
import { SummaryContents, serialize } from './Summary.js';
import { deserialize, getSummaryStatistics } from './SummaryBackCompatibility.js';
import { TransactionInternal } from './TransactionInternal.js';
import { nilUuid } from './UuidUtilities.js';
import { IdCompressor, createSessionId } from './id-compressor/index.js';
import {
	BuildNodeInternal,
	ChangeInternal,
	ChangeNode,
	ChangeTypeInternal,
	ConstraintInternal,
	DetachInternal,
	Edit,
	EditLogSummary,
	EditStatus,
	InternalizedChange,
	SharedTreeEditOp,
	SharedTreeEditOp_0_0_2,
	SharedTreeOp,
	SharedTreeOpType,
	SharedTreeOp_0_0_2,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummary_0_0_2,
	TreeNode,
	TreeNodeSequence,
	WriteFormat,
	ghostSessionId,
	reservedIdCount,
} from './persisted-types/index.js';
import { SharedTreeAttributes, SharedTreeType } from './publicContracts.js';

/**
 * The write format and associated options used to construct a `SharedTree`
 * @alpha
 */
export type SharedTreeArgs<WF extends WriteFormat = WriteFormat> = [writeFormat: WF, options?: SharedTreeOptions<WF>];

/**
 * The type of shared tree options for a given write format
 * @alpha
 */
export type SharedTreeOptions<
	WF extends WriteFormat,
	HistoryCompatibility extends 'Forwards' | 'None' = 'Forwards',
> = SharedTreeBaseOptions &
	Omit<
		WF extends WriteFormat.v0_0_2
			? SharedTreeOptions_0_0_2
			: WF extends WriteFormat.v0_1_1
				? SharedTreeOptions_0_1_1
				: never,
		HistoryCompatibility extends 'Forwards' ? 'summarizeHistory' : never
	>;

/**
 * Configuration options for SharedTree that are independent of write format versions.
 * @alpha
 */
export interface SharedTreeBaseOptions {
	/**
	 * The target number of sequenced edits that the tree will try to store in memory.
	 * Depending on eviction frequency and the collaboration window, there can be more edits in memory at a given time.
	 * Edits in the collaboration window are not evicted.
	 *
	 * The size is set to infinity by default, meaning that all edits in session are kept within memory.
	 */
	inMemoryHistorySize?: number;
	/**
	 * The rate at which edits are evicted from memory. This is a factor of the inMemoryHistorySize.
	 * For example, with the default frequency of inMemoryHistorySize * 2 and a size of 10, the log will evict once it reaches 20 sequenced edits
	 * down to 10 edits, also keeping any that are still in the collaboration window.
	 */
	editEvictionFrequency?: number;
}

/**
 * Configuration options for a SharedTree with write format 0.0.2
 * @alpha
 */
export interface SharedTreeOptions_0_0_2 {
	/**
	 * Determines if the history is included in summaries.
	 *
	 * Warning: enabling history summarization incurs a permanent cost in the document. It is not possible to disable history summarization
	 * later once it has been enabled, and thus the history cannot be safely deleted.
	 *
	 * On 0.1.1 documents, due to current code limitations, this parameter is only impactful for newly created documents.
	 * `SharedTree`s which load existing documents will summarize history if and only if the loaded summary included history.
	 *
	 * The technical limitations here relate to clients with mixed versions collaborating.
	 * In the future we may allow modification of whether or not a particular document saves history, but only via a consensus mechanism.
	 * See the skipped test in SharedTreeFuzzTests.ts for more details on this issue.
	 * See docs/Breaking-Change-Migration for more details on the consensus scheme.
	 */
	summarizeHistory?: boolean;
}

/**
 * Configuration options for a SharedTree with write format 0.1.1
 * @alpha
 */
export interface SharedTreeOptions_0_1_1 {
	/**
	 * Determines if the history is included in summaries and if edit chunks are uploaded when they are full.
	 *
	 * Warning: enabling history summarization incurs a permanent cost in the document. It is not possible to disable history summarization
	 * later once it has been enabled, and thus the history cannot be safely deleted.
	 *
	 * On 0.1.1 documents, due to current code limitations, this parameter is only impactful for newly created documents.
	 * `SharedTree`s which load existing documents will summarize history if and only if the loaded summary included history.
	 *
	 * The technical limitations here relate to clients with mixed versions collaborating.
	 * In the future we may allow modification of whether or not a particular document saves history, but only via a consensus mechanism.
	 * See the skipped test in SharedTreeFuzzTests.ts for more details on this issue.
	 * See docs/Breaking-Change-Migration for more details on the consensus scheme.
	 */
	summarizeHistory?: false | { uploadEditChunks: boolean };
	/** a UUID that identifies the user of this tree; all node IDs generated by this tree will be associated with this UUID */
	attributionId?: AttributionId;
}

/**
 * Factory for SharedTree.
 * Includes history in the summary.
 * @alpha
 */
export class SharedTreeFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public static Type = SharedTreeType;

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public static Attributes: IChannelAttributes = SharedTreeAttributes;

	private readonly args: SharedTreeArgs;

	/**
	 * Get a factory for SharedTree to register with the data store.
	 * @param writeFormat - Determines the format version the SharedTree will write ops and summaries in. See [the write format
	 * documentation](../docs/Write-Format.md) for more information.
	 * @param options - Configuration options for this tree
	 * @returns A factory that creates `SharedTree`s and loads them from storage.
	 */
	constructor(...args: SharedTreeArgs) {
		this.args = args;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public get type(): string {
		return SharedTreeFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return SharedTreeFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		_channelAttributes: Readonly<IChannelAttributes>
	): Promise<SharedTree> {
		const sharedTree = this.createSharedTree(runtime, id);
		await sharedTree.load(services);
		return sharedTree;
	}

	/**
	 * Create a new SharedTree.
	 * @param runtime - data store runtime that owns the new SharedTree
	 * @param id - optional name for the SharedTree
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): SharedTree {
		const sharedTree = this.createSharedTree(runtime, id);
		sharedTree.initializeLocal();
		return sharedTree;
	}

	private createSharedTree(runtime: IFluidDataStoreRuntime, id: string): SharedTree {
		const [writeFormat] = this.args;
		switch (writeFormat) {
			case WriteFormat.v0_0_2:
				return new SharedTree(runtime, id, ...(this.args as SharedTreeArgs<WriteFormat.v0_0_2>));
			case WriteFormat.v0_1_1:
				return new SharedTree(runtime, id, ...(this.args as SharedTreeArgs<WriteFormat.v0_1_1>));
			default:
				fail('Unknown write format');
		}
	}
}

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = 'header';

/**
 * Used for version comparison.
 */
const sortedWriteVersions = [WriteFormat.v0_0_2, WriteFormat.v0_1_1];

/**
 * The arguments included when the EditCommitted SharedTreeEvent is emitted.
 * @alpha
 */
export interface EditCommittedEventArguments {
	/** The ID of the edit committed. */
	readonly editId: EditId;
	/** Whether or not this is a local edit. */
	readonly local: boolean;
	/** The tree the edit was committed on. Required for local edit events handled by SharedTreeUndoRedoHandler. */
	readonly tree: SharedTree;
}

/**
 * The arguments included when the {@link SharedTreeEvent.SequencedEditApplied} SharedTreeEvent is emitted.
 * @alpha
 */
export interface SequencedEditAppliedEventArguments {
	/** The ID of the edit committed. */
	readonly edit: Edit<ChangeInternal>;
	/** Whether or not this was a local edit. */
	readonly wasLocal: boolean;
	/** The tree the edit was applied to. */
	readonly tree: SharedTree;
	/** The telemetry logger associated with sequenced edit application. */
	readonly logger: ITelemetryLoggerExt;
	/** The reconciliation path for the edit. See {@link ReconciliationPath} for details. */
	readonly reconciliationPath: ReconciliationPath;
	/** The outcome of the sequenced edit being applied. */
	readonly outcome: EditApplicationOutcome;
}

/**
 * The outcome of an edit.
 * @alpha
 */
export type EditApplicationOutcome =
	| {
			/**
			 * The revision view resulting from the edit.
			 */
			readonly view: RevisionView;
			/**
			 * The status code for the edit that produced the revision.
			 */
			readonly status: EditStatus.Applied;
	  }
	| {
			/**
			 * The revision view resulting from the edit.
			 */
			readonly failure: TransactionInternal.Failure;
			/**
			 * The status code for the edit that produced the revision.
			 */
			readonly status: EditStatus.Invalid | EditStatus.Malformed;
	  };

/**
 * Events which may be emitted by `SharedTree`. See {@link SharedTreeEvent} for documentation of event semantics.
 * @alpha
 */
export interface ISharedTreeEvents extends ISharedObjectEvents {
	(event: 'committedEdit', listener: EditCommittedHandler);
	(event: 'appliedSequencedEdit', listener: SequencedEditAppliedHandler);
}

/**
 * Expected type for a handler of the `EditCommitted` event.
 * @alpha
 */
export type EditCommittedHandler = (args: EditCommittedEventArguments) => void;

/**
 * Expected type for a handler of the {@link SharedTreeEvent.SequencedEditApplied} event.
 * @alpha
 */
export type SequencedEditAppliedHandler = (args: SequencedEditAppliedEventArguments) => void;

const sharedTreeTelemetryProperties: ITelemetryLoggerPropertyBags = {
	all: { isSharedTreeEvent: true },
};

/**
 * Contains information resulting from processing stashed shared tree ops
 * @alpha
 */
export interface StashedLocalOpMetadata {
	/** A modified version of the edit in an edit op that should be resubmitted rather than the original edit */
	transformedEdit?: Edit<ChangeInternal>;
}

/** The SessionId of the temporary IdCompressor that records stashed ops */
const stashedSessionId = '8477b8d5-cf6c-4673-8345-8f076a8f9bc6' as SessionId;

/**
 * A [distributed tree](../Readme.md).
 * @alpha
 */
export class SharedTree extends SharedObject<ISharedTreeEvents> implements NodeIdContext {
	/**
	 * Create a new SharedTree. It will contain the default value (see initialTree).
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedTree {
		return runtime.createChannel(id, SharedTreeFactory.Type) as SharedTree;
	}

	/**
	 * Get a factory for SharedTree to register with the data store.
	 * @param writeFormat - Determines the format version the SharedTree will write ops and summaries in.
	 * This format may be updated to a newer (supported) version at runtime if a collaborating shared-tree
	 * that was initialized with a newer write version connects to the session. Care must be taken when changing this value,
	 * as a staged rollout must of occurred such that all collaborating clients must have the code to read at least the version
	 * written.
	 * See [the write format documentation](../docs/Write-Format.md) for more information.
	 * @param options - Configuration options for this tree
	 * @returns A factory that creates `SharedTree`s and loads them from storage.
	 */
	public static getFactory(...args: SharedTreeArgs<WriteFormat.v0_0_2>): SharedTreeFactory;

	public static getFactory(...args: SharedTreeArgs<WriteFormat.v0_1_1>): SharedTreeFactory;

	/**
	 * Get a factory for SharedTree to register with the data store, using the latest write version and default options.
	 */
	public static getFactory(): SharedTreeFactory;

	public static getFactory(...args: SharedTreeArgs | []): SharedTreeFactory {
		const [formatArg, options] = args;
		const writeFormat = formatArg ?? WriteFormat.v0_1_1;
		// 	On 0.1.1 documents, due to current code limitations, all clients MUST agree on the value of `summarizeHistory`.
		//  Note that this means staged rollout changing this value should not be attempted.
		//  It is possible to update shared-tree to correctly handle such a staged rollout, but that hasn't been implemented.
		//  See the skipped test in SharedTreeFuzzTests.ts for more details on this issue.
		return new SharedTreeFactory(writeFormat, options);
	}

	/**
	 * The UUID used for attribution of nodes created by this SharedTree. All shared trees with a write format of 0.1.1 or
	 * greater have a unique attribution ID which may be configured in the constructor. All other shared trees (i.e. those
	 * with a write format of 0.0.2) use the nil UUID as their attribution ID.
	 */
	public get attributionId(): AttributionId {
		switch (this.writeFormat) {
			case WriteFormat.v0_0_2:
				return nilUuid;
			default: {
				const { attributionId } = this.idCompressor;
				if (attributionId === ghostSessionId) {
					return nilUuid;
				}
				return attributionId;
			}
		}
	}

	/**
	 * This is SharedTree's internal IdCompressor that predates the one in the runtime. If access
	 * to the IdCompressor is needed, this is the one that should be used.
	 */
	private idCompressor: IdCompressor;

	private readonly idNormalizer: NodeIdNormalizer<OpSpaceNodeId> & { tree: SharedTree } = {
		tree: this,
		get localSessionId() {
			return this.tree.idCompressor.localSessionId;
		},
		normalizeToOpSpace: (id) => this.idCompressor.normalizeToOpSpace(id) as OpSpaceNodeId,
		normalizeToSessionSpace: (id, sessionId) => this.idCompressor.normalizeToSessionSpace(id, sessionId) as NodeId,
	};
	/** Temporarily created to apply stashed ops from a previous session */
	private stashedIdCompressor?: IdCompressor | null;

	// The initial tree's definition isn't included in any op by default but it should still be interned. Including it here ensures that.
	private interner: MutableStringInterner = new MutableStringInterner([initialTree.definition]);

	/**
	 * The log of completed edits for this SharedTree.
	 */
	private editLog: EditLog<ChangeInternal>;
	private readonly editLogSize?: number;
	private readonly editEvictionFrequency?: number;

	/**
	 * As an implementation detail, SharedTree uses a log viewer that caches views of different revisions.
	 * It is not exposed to avoid accidental correctness issues, but `logViewer` is exposed in order to give clients a way
	 * to access the revision history.
	 */
	private cachingLogViewer: CachingLogViewer;

	/**
	 * Viewer for trees defined by editLog. This allows access to views of the tree at different revisions (various points in time).
	 */
	public get logViewer(): LogViewer {
		return this.cachingLogViewer;
	}

	/**
	 * logger for SharedTree events.
	 */
	public readonly logger: ITelemetryLoggerExt;
	private readonly sequencedEditAppliedLogger: ITelemetryLoggerExt;

	private readonly encoder_0_0_2: SharedTreeEncoder_0_0_2;
	private encoder_0_1_1: SharedTreeEncoder_0_1_1;

	private readonly processEditResult = (editResult: EditStatus, editId: EditId): void => {
		// TODO:#44859: Invalid results should be handled by the app
		this.emit(SharedTree.eventFromEditResult(editResult), editId);
	};

	private readonly processSequencedEditResult = ({
		edit,
		wasLocal,
		result,
		reconciliationPath,
	}: SequencedEditResult): void => {
		const eventArguments: SequencedEditAppliedEventArguments = {
			edit,
			wasLocal,
			tree: this,
			logger: this.sequencedEditAppliedLogger,
			reconciliationPath,
			outcome: result,
		};
		this.emit(SharedTreeEvent.SequencedEditApplied, eventArguments);
	};

	private summarizeHistory: boolean;

	private getHistoryPolicy(options: SharedTreeOptions<WriteFormat, 'Forwards' | 'None'>): {
		summarizeHistory: boolean;
	} {
		const noCompatOptions = options as SharedTreeOptions<WriteFormat, 'None'>;
		return typeof noCompatOptions.summarizeHistory === 'object'
			? {
					summarizeHistory: true,
				}
			: {
					summarizeHistory: noCompatOptions.summarizeHistory ?? false,
				};
	}

	/**
	 * Create a new SharedTree.
	 * @param runtime - The runtime the SharedTree will be associated with
	 * @param id - Unique ID for the SharedTree
	 * @param writeFormat - Determines the format version the SharedTree will write ops and summaries in. See [the write format
	 * documentation](../docs/Write-Format.md) for more information.
	 * @param options - Configuration options for this tree
	 */
	public constructor(runtime: IFluidDataStoreRuntime, id: string, ...args: SharedTreeArgs<WriteFormat.v0_0_2>);

	public constructor(runtime: IFluidDataStoreRuntime, id: string, ...args: SharedTreeArgs<WriteFormat.v0_1_1>);

	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		private writeFormat: WriteFormat,
		options: SharedTreeOptions<typeof writeFormat> = {}
	) {
		super(id, runtime, SharedTreeFactory.Attributes, 'fluid_legacySharedTree_');
		const historyPolicy = this.getHistoryPolicy(options);
		this.summarizeHistory = historyPolicy.summarizeHistory;

		this.logger = createChildLogger({
			logger: runtime.logger,
			namespace: 'SharedTree',
			properties: sharedTreeTelemetryProperties,
		});
		this.sequencedEditAppliedLogger = createChildLogger({
			logger: this.logger,
			namespace: 'SequencedEditApplied',
			properties: sharedTreeTelemetryProperties,
		});

		const attributionId = (options as SharedTreeOptions<WriteFormat.v0_1_1>).attributionId;

		/**
		 * Because the IdCompressor emits so much telemetry, this function is used to sample
		 * approximately 5% of all clients. Only the given percentage of sessions will emit telemetry.
		 */
		const idCompressorEventSampler: IEventSampler = (() => {
			const isIdCompressorTelemetryEnabled = Math.random() < 0.05;
			return {
				sample: () => {
					return isIdCompressorTelemetryEnabled;
				},
			};
		})();
		const idCompressorLoger = createSampledLogger(this.logger, idCompressorEventSampler);
		this.idCompressor = new IdCompressor(createSessionId(), reservedIdCount, attributionId, idCompressorLoger);
		this.editLogSize = options.inMemoryHistorySize;
		this.editEvictionFrequency = options.inMemoryHistorySize;
		const { editLog, cachingLogViewer } = this.initializeNewEditLogFromSummary(
			{
				editChunks: [],
				editIds: [],
			},
			undefined,
			this.idCompressor,
			this.processEditResult,
			this.processSequencedEditResult,
			WriteFormat.v0_1_1
		);
		this.editLog = editLog;
		this.cachingLogViewer = cachingLogViewer;
		this.encoder_0_0_2 = new SharedTreeEncoder_0_0_2(this.summarizeHistory);
		this.encoder_0_1_1 = new SharedTreeEncoder_0_1_1(this.summarizeHistory);
	}

	/**
	 * The write format version currently used by this `SharedTree`. This is always initialized to the write format
	 * passed to the tree's constructor, but it may automatically upgrade over time (e.g. when connected to another
	 * SharedTree with a higher write format, or when loading a summary with a higher write format).
	 */
	public getWriteFormat(): WriteFormat {
		return this.writeFormat;
	}

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

		assert(this.runtime.clientId !== undefined, 0x62d /* Client id should be set if connected. */);

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
	public get currentView(): RevisionView {
		return this.logViewer.getRevisionViewInMemory(Number.POSITIVE_INFINITY);
	}

	/**
	 * Generates a node identifier.
	 * The returned IDs may be used as the identifier of a node in the SharedTree.
	 * `NodeId`s are *always* unique and stable within the scope of the tree and session that generated them. They are *not* unique within
	 * a Fluid container, and *cannot* be compared across instances of a SharedTree. They are *not* stable across sessions/lifetimes of a
	 * SharedTree, and *cannot* be persisted (e.g. stored in payloads, uploaded in blobs, etc.). If stable persistence is needed,
	 * NodeIdConverter.convertToStableNodeId may be used to return a corresponding UUID that is globally unique and stable.
	 * @param override - if supplied, calls to `convertToStableNodeId` using the returned node ID will return the override instead of
	 * the UUID. Calls to `generateNodeId` with the same override always return the same ID. Performance note: passing an override string
	 * incurs a storage cost that is significantly higher that a node ID without one, and should be avoided if possible.
	 */
	public generateNodeId(override?: string): NodeId {
		return this.idCompressor.generateCompressedId(override) as NodeId;
	}

	/**
	 * Given a NodeId, returns the corresponding stable ID or throws if the supplied node ID was not generated with this tree (`NodeId`s
	 * may not be used across SharedTree instances, see `generateNodeId` for more).
	 * The returned value will be a UUID, unless the creation of `id` used an override string (see `generateNodeId` for more).
	 * The result is safe to persist and re-use across `SharedTree` instances, unlike `NodeId`.
	 */
	public convertToStableNodeId(id: NodeId): StableNodeId {
		return (this.idCompressor.tryDecompress(id) as StableNodeId) ?? fail('Node id is not known to this SharedTree');
	}

	/**
	 * Given a NodeId, attempt to return the corresponding stable ID.
	 * The returned value will be a UUID, unless the creation of `id` used an override string (see `generateNodeId` for more).
	 * The returned stable ID is undefined if `id` was never created with this SharedTree. If a stable ID is returned, this does not imply
	 * that there is a node with `id` in the current revision of the tree, only that `id` was at some point generated by some instance of
	 * this tree.
	 */
	public tryConvertToStableNodeId(id: NodeId): StableNodeId | undefined {
		return this.idCompressor.tryDecompress(id) as StableNodeId | undefined;
	}

	/**
	 * Given a stable ID, return the corresponding NodeId or throws if the supplied stable ID was never generated with this tree, either
	 * as a UUID corresponding to a `NodeId` or as an override passed to `generateNodeId`.
	 * If a stable ID is returned, this does not imply that there is a node with `id` in the current revision of the tree, only that
	 * `id` was at some point generated by an instance of this SharedTree.
	 */
	public convertToNodeId(id: StableNodeId): NodeId {
		return (this.idCompressor.tryRecompress(id) as NodeId) ?? fail('Stable node id is not known to this SharedTree');
	}

	/**
	 * Given a stable ID, return the corresponding NodeId or return undefined if the supplied stable ID was never generated with this tree,
	 * either as a UUID corresponding to a `NodeId` or as an override passed to `generateNodeId`.
	 * If a stable ID is returned, this does not imply that there is a node with `id` in the current revision of the tree, only that
	 * `id` was at some point generated by an instance of this SharedTree.
	 */
	public tryConvertToNodeId(id: StableNodeId): NodeId | undefined {
		return this.idCompressor.tryRecompress(id) as NodeId | undefined;
	}

	/**
	 * Returns the attribution ID associated with the SharedTree that generated the given node ID. This is generally only useful for clients
	 * with a write format of 0.1.1 or greater since older clients cannot be given an attribution ID and will always use the default
	 * `attributionId` of the tree.
	 */
	public attributeNodeId(id: NodeId): AttributionId {
		switch (this.writeFormat) {
			case WriteFormat.v0_0_2:
				return nilUuid;
			default: {
				const attributionId = this.idCompressor.attributeId(id);
				if (attributionId === ghostSessionId) {
					return nilUuid;
				}
				return attributionId;
			}
		}
	}

	/**
	 * @returns the edit history of the tree.
	 */
	public get edits(): OrderedEditSet<InternalizedChange> {
		return this.editLog as unknown as OrderedEditSet<InternalizedChange>;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	public summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		return createSingleBlobSummary(snapshotFileName, this.saveSerializedSummary({ serializer }));
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getAttachSummary}
	 */
	public override getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined
	): ISummaryTreeWithStats {
		// If local changes exist, emulate the sequencing of those changes.
		// Doing so is necessary so edits created during DataObject.initializingFirstTime are included.
		// Doing so is safe because it is guaranteed that the DDS has not yet been attached. This is because summary creation is only
		// ever invoked on a DataObject containing local changes when it is attached for the first time. In post-attach flows, an extra
		// instance of the DataObject is created for generating summaries and will never have local edits.
		if (this.editLog.numberOfLocalEdits > 0) {
			if (this.writeFormat === WriteFormat.v0_1_1) {
				// Since we're the first client to attach, we can safely finalize ourselves since we're the only ones who have made IDs.
				this.idCompressor.finalizeCreationRange(this.idCompressor.takeNextCreationRange());
				for (const edit of this.editLog.getLocalEdits()) {
					this.internStringsFromEdit(edit);
				}
			}
			this.editLog.sequenceLocalEdits();
		}
		return super.getAttachSummary(fullTree, trackState, telemetryContext);
	}

	/**
	 * Saves this SharedTree into a serialized summary. This is used for testing.
	 *
	 * @param summarizer - Optional summarizer to use. If not passed in, SharedTree's summarizer is used.
	 */
	public saveSerializedSummary(options?: { serializer?: IFluidSerializer }): string {
		const { serializer } = options ?? {};
		return serialize(this.saveSummary(), serializer ?? this.serializer, this.handle);
	}

	/**
	 * Initialize shared tree with a serialized summary. This is used for testing.
	 * @returns Statistics about the loaded summary.
	 */
	public loadSerializedSummary(blobData: string): ITelemetryBaseProperties {
		const summary = deserialize(blobData, this.serializer);
		this.loadSummary(summary);
		return getSummaryStatistics(summary);
	}

	/**
	 * Saves this SharedTree into a deserialized summary.
	 */
	public saveSummary(): SharedTreeSummaryBase {
		assert(this.editLog.numberOfLocalEdits === 0, 0x62f /* generateSummary must not be called with local edits */);
		return this.generateSummary();
	}

	/**
	 * Generates a SharedTree summary for the current state of the tree.
	 * Will never be called when local edits are present.
	 */
	private generateSummary(): SharedTreeSummaryBase {
		try {
			switch (this.writeFormat) {
				case WriteFormat.v0_0_2:
					return this.encoder_0_0_2.encodeSummary(this.editLog, this.currentView, this);
				case WriteFormat.v0_1_1:
					return this.encoder_0_1_1.encodeSummary(
						this.editLog,
						this.currentView,
						this,
						this.idNormalizer,
						this.interner,
						this.idCompressor.serialize(false)
					);
				default:
					fail('Unknown version');
			}
		} catch (error) {
			this.logger?.sendErrorEvent({
				eventName: 'UnsupportedSummaryWriteFormat',
				formatVersion: this.writeFormat,
			});
			throw error;
		}
	}

	/**
	 * Initialize shared tree with a deserialized summary.
	 */
	public loadSummary(summary: SharedTreeSummaryBase): void {
		const { version: loadedSummaryVersion } = summary;

		if (this.deltaManager.readOnlyInfo.readonly !== true && isUpdateRequired(loadedSummaryVersion, this.writeFormat)) {
			this.submitOp({ type: SharedTreeOpType.Update, version: this.writeFormat });
			this.logger.sendTelemetryEvent({
				eventName: 'RequestVersionUpdate',
				versionFrom: loadedSummaryVersion,
				versionTo: this.writeFormat,
			});
		}

		if (compareSummaryFormatVersions(loadedSummaryVersion, this.writeFormat) !== 0) {
			// Write whatever format the loaded summary uses (this is the current agreed-upon format: it may be updated by an update op)
			this.changeWriteFormat(loadedSummaryVersion);
		}

		assert(
			this.idCompressor.getAllIdsFromLocalSession().next().done === true,
			0x630 /* Summary load should not be executed after local state is created. */
		);

		let convertedSummary: SummaryContents;
		switch (loadedSummaryVersion) {
			case WriteFormat.v0_0_2:
				convertedSummary = this.encoder_0_0_2.decodeSummary(summary as SharedTreeSummary_0_0_2, this.attributionId);
				break;
			case WriteFormat.v0_1_1: {
				const typedSummary = summary as SharedTreeSummary;
				// See comment in factory constructor--ensure we write a consistent type of summary as how the document began.
				const loadedSummaryIncludesHistory = typedSummary.currentTree !== undefined;
				if (loadedSummaryIncludesHistory !== this.summarizeHistory) {
					this.summarizeHistory = loadedSummaryIncludesHistory;
					this.encoder_0_1_1 = new SharedTreeEncoder_0_1_1(this.summarizeHistory);
				}

				convertedSummary = this.encoder_0_1_1.decodeSummary(summary as SharedTreeSummary, this.attributionId);
				break;
			}
			default:
				fail('Unknown version');
		}

		const { editHistory, currentTree, idCompressor, interner } = convertedSummary;
		this.interner = interner;
		this.interner.getOrCreateInternedId(initialTree.definition);
		if (compareSummaryFormatVersions(loadedSummaryVersion, WriteFormat.v0_1_1) < 0) {
			const { editIds, editChunks } = editHistory;
			this.logger.sendTelemetryEvent({
				eventName: 'SummaryConversion',
				formatVersion: WriteFormat.v0_1_1,
				historySize: editIds.length,
				totalNumberOfChunks: editChunks.length,
			});
		}

		this.initializeNewEditLogFromSummary(
			editHistory,
			currentTree,
			idCompressor,
			this.processEditResult,
			this.processSequencedEditResult,
			summary.version
		);
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

	/**
	 * Initializes a new `EditLog` and `CachingLogViewer` on this `SharedTree`, replacing and disposing of any previously existing ones.
	 * @returns the initialized values (this is mostly to keep the constructor happy)
	 */
	private initializeNewEditLogFromSummary(
		editHistory: EditLogSummary<ChangeInternal, EditHandle<ChangeInternal>>,
		currentTree: ChangeNode | undefined,
		idCompressor: IdCompressor,
		editStatusCallback: EditStatusCallback,
		sequencedEditResultCallback: SequencedEditResultCallback,
		version: WriteFormat
	): { editLog: EditLog<ChangeInternal>; cachingLogViewer: CachingLogViewer } {
		this.idCompressor = idCompressor;
		// Dispose the current log viewer if it exists. This ensures that re-used EditAddedHandlers below don't retain references to old
		// log viewers.
		this.cachingLogViewer?.detachFromEditLog();

		// Use previously registered EditAddedHandlers if there is an existing EditLog.
		const editLog = new EditLog(
			editHistory,
			this.logger,
			this.editLog?.editAddedHandlers,
			this.editLogSize,
			this.editEvictionFrequency
		);

		editLog.on(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk, () => {
			this.emit(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk);
		});

		let initialRevision: [number, EditCacheEntry] | undefined;
		if (currentTree !== undefined) {
			const currentView = RevisionView.fromTree(currentTree);
			initialRevision = [editLog.length, { view: currentView }];
		}

		const logViewer = new CachingLogViewer(
			editLog,
			RevisionView.fromTree(initialTree, this),
			initialRevision,
			editStatusCallback,
			sequencedEditResultCallback,
			0
		);

		this.editLog = editLog;
		this.cachingLogViewer = logViewer;
		return { editLog, cachingLogViewer: logViewer };
	}

	/**
	 * Compares this shared tree to another for equality. Should only be used for internal correctness testing.
	 *
	 * Equality means that the histories as captured by the EditLogs are equivalent.
	 *
	 * Equality does not include:
	 *
	 * - if an edit is open
	 *
	 * - the shared tree's id
	 *
	 * - local vs sequenced status of edits
	 *
	 * - registered event listeners
	 *
	 * - state of caches
	 */
	public equals(sharedTree: SharedTree): boolean {
		if (!areRevisionViewsSemanticallyEqual(this.currentView, this, sharedTree.currentView, sharedTree)) {
			return false;
		}

		return this.editLog.equals(sharedTree.editLog);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const summaryLoadPerformanceEvent = PerformanceEvent.start(this.logger, {
			eventName: 'SummaryLoad',
		});

		try {
			const newBlob = await storage.readBlob(snapshotFileName);
			const blobData = bufferToString(newBlob, 'utf8');

			const stats = this.loadSerializedSummary(blobData);

			summaryLoadPerformanceEvent.end(stats);
		} catch (error) {
			summaryLoadPerformanceEvent.cancel({ eventName: 'SummaryLoadFailure' }, error);
			throw error;
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(message: unknown, local: boolean): void {
		const typedMessage = message as Omit<ISequencedDocumentMessage, 'contents'> & {
			contents: SharedTreeOp_0_0_2 | SharedTreeOp;
		};
		this.cachingLogViewer.setMinimumSequenceNumber(typedMessage.minimumSequenceNumber);
		const op = typedMessage.contents;
		if (op.version === undefined) {
			// Back-compat: some legacy documents may contain trailing ops with an unstamped version; normalize them.
			(op as { version: WriteFormat | undefined }).version = WriteFormat.v0_0_2;
		}
		const { type, version } = op;
		const sameVersion = version === this.writeFormat;

		// Edit and handle ops should only be processed if they're the same version as the tree write version.
		// Update ops should only be processed if they're not the same version.
		if (sameVersion) {
			if (type === SharedTreeOpType.Handle) {
				// Edit virtualization is no longer supported, log the event and ignore the op.
				this.logger.sendErrorEvent({ eventName: 'UnexpectedHistoryChunk' });
			} else if (type === SharedTreeOpType.Edit) {
				if (op.version === WriteFormat.v0_1_1) {
					this.idCompressor.finalizeCreationRange(op.idRange);
				}
				const edit = this.parseSequencedEdit(op);
				if (op.version === WriteFormat.v0_1_1) {
					this.internStringsFromEdit(edit);
				}
				this.processSequencedEdit(edit, typedMessage);
			}
		} else if (type === SharedTreeOpType.Update) {
			this.processVersionUpdate(op.version);
		} else if (compareSummaryFormatVersions(version, this.writeFormat) === 1) {
			// An op version newer than our current version should not be received. If this happens, either an
			// incorrect op version has been written or an update op was skipped.
			const error = 'Newer op version received by a client that has yet to be updated.';
			this.logger.sendErrorEvent(
				{
					eventName: 'UnexpectedNewerOpVersion',
				},
				error
			);
			fail(error);
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

	/**
	 * Parses a sequenced edit. This is only invoked for ops with version matching the current `writeFormat`.
	 */
	private parseSequencedEdit(op: SharedTreeEditOp | SharedTreeEditOp_0_0_2): Edit<ChangeInternal> {
		// TODO:Type Safety: Improve type safety around op sending/parsing (e.g. discriminated union over version field somehow)
		switch (op.version) {
			case WriteFormat.v0_0_2:
				return this.encoder_0_0_2.decodeEditOp(op, (x) => x, this);
			case WriteFormat.v0_1_1:
				return this.encoder_0_1_1.decodeEditOp(op, (x) => x, this.idNormalizer, this.interner);
			default:
				fail('Unknown op version');
		}
	}

	private processSequencedEdit(edit: Edit<ChangeInternal>, message: ISequencedDocumentMessage): void {
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

		if (wasLocalEdit) {
			this.editLog.addSequencedEdit(edit, message);
		} else {
			this.applyEditLocally(edit, message);
		}
	}

	/**
	 * Updates SharedTree to the provided version if the version is a valid write version newer than the current version.
	 * @param version - The version to update to.
	 */
	private processVersionUpdate(version: WriteFormat) {
		if (isUpdateRequired(this.writeFormat, version)) {
			PerformanceEvent.timedExec(
				this.logger,
				{ eventName: 'VersionUpdate', version },
				() => {
					if (compareSummaryFormatVersions(version, WriteFormat.v0_1_1) >= 0) {
						this.upgradeFrom_0_0_2_to_0_1_1();
					} else {
						throw new Error(`Updating to version ${version} is not supported.`);
					}

					this.changeWriteFormat(version);

					// The edit log may contain some local edits submitted after the version update op was submitted but
					// before we receive the message it has been sequenced. Since these edits must be sequenced after the version
					// update op, they will be discarded. These edits are then re-submitted using the new format.
					for (const edit of this.editLog.getLocalEdits()) {
						this.submitEditOp(edit);
					}
				},
				{
					end: true,
					cancel: 'error',
				}
			);
		}
	}

	private upgradeFrom_0_0_2_to_0_1_1(): void {
		// Reset the string interner, re-populate only with information that there is consensus on
		this.interner = new MutableStringInterner([initialTree.definition]);
		const oldIdCompressor = this.idCompressor;
		// Create the IdCompressor that will be used after the upgrade
		const newIdCompressor = new IdCompressor(createSessionId(), reservedIdCount, this.attributionId, this.logger);
		const newContext = getNodeIdContext(newIdCompressor);
		// Generate all local IDs in the new compressor that were in the old compressor and preserve their UUIDs.
		// This will allow the client to continue to use local IDs that were allocated pre-upgrade
		for (const localId of oldIdCompressor.getAllIdsFromLocalSession()) {
			newIdCompressor.generateCompressedId(oldIdCompressor.decompress(localId));
		}

		const unifyHistoricalIds = (context: NodeIdContext): void => {
			for (let i = 0; i < this.editLog.numberOfSequencedEdits; i++) {
				const edit = this.editLog.tryGetEditAtIndex(i) ?? fail('edit not found');
				convertEditIds(edit, (id) => context.generateNodeId(this.convertToStableNodeId(id)));
			}
		};
		// Construct a temporary "ghost" compressor which is used to generate final IDs that will be consistent across all upgrading clients
		const ghostIdCompressor = new IdCompressor(ghostSessionId, reservedIdCount);
		const ghostContext = getNodeIdContext(ghostIdCompressor);
		if (this.summarizeHistory) {
			// All clients have the full history, and can therefore all "generate" the same final IDs for every ID in the history
			// via the ghost compressor.
			unifyHistoricalIds(ghostContext);
			// The same logic applies to string interning, so intern all the strings in the history (superset of those in the current view)
			for (let i = 0; i < this.editLog.numberOfSequencedEdits; i++) {
				this.internStringsFromEdit(this.editLog.tryGetEditAtIndex(i) ?? fail('edit not found'));
			}
		} else {
			// Clients do not have the full history, but all share the same current view (sequenced). They can all finalize the same final
			// IDs for every ID in the view via the ghost compressor.
			// The same logic applies for the string interner.
			for (const node of this.logViewer.getRevisionViewInMemory(this.editLog.numberOfSequencedEdits)) {
				ghostContext.generateNodeId(this.convertToStableNodeId(node.identifier));
				this.interner.getOrCreateInternedId(node.definition);
				for (const label of [...node.traits.keys()].sort()) {
					this.interner.getOrCreateInternedId(label);
				}
			}
			// Every node in this client's history can simply be generated in the new compressor as well, preserving the UUID
			unifyHistoricalIds(newContext);
		}
		// Finalize any IDs in the ghost compressor into the actual compressor. This simulates all clients reaching a consensus on those IDs
		newIdCompressor.finalizeCreationRange(ghostIdCompressor.takeNextCreationRange());
		this.idCompressor = newIdCompressor;
	}

	/**
	 * Applies a set of changes to this tree. The result will be reflected in `SharedTree.currentView`.
	 * This method does not allow for snapshot isolation, as the changes are always applied to the most recent revision.
	 * If it is desireable to read from and apply changes to a fixed view that does not change when remote changes arrive, `Checkout`
	 * should be used instead.
	 */
	public applyEdit(...changes: readonly Change[]): Edit<InternalizedChange>;
	public applyEdit(changes: readonly Change[]): Edit<InternalizedChange>;
	public applyEdit(...changesOrArray: RestOrArray<Change>): Edit<InternalizedChange> {
		const changes = unwrapRestOrArray(changesOrArray);
		const id = newEditId();
		const internalEdit: Edit<ChangeInternal> = {
			id,
			changes: changes.map((c) => this.internalizeChange(c)),
		};
		this.submitEditOp(internalEdit);
		this.applyEditLocally(internalEdit, undefined);
		return internalEdit as unknown as Edit<InternalizedChange>;
	}

	/**
	 * Merges `edits` from `other` into this SharedTree.
	 * @param other - Tree containing the edits that should be applied to this one.
	 * @param edits - Iterable of edits from `other` to apply.
	 * @param stableIdRemapper - Optional remapper to translate stable identities from `other` into stable identities on this tree.
	 * Any references that `other` contains to a stable id `foo` will be replaced with references to the id `stableIdRemapper(foo)`.
	 *
	 * Payloads on the edits are left intact.
	 * @returns a list containing `EditId`s for all applied edits.
	 */
	public mergeEditsFrom(
		other: SharedTree,
		edits: Iterable<Edit<InternalizedChange>>,
		stableIdRemapper?: (id: StableNodeId) => StableNodeId
	): EditId[] {
		const idConverter = (id: NodeId) => {
			const stableId = other.convertToStableNodeId(id);
			const convertedStableId = stableIdRemapper?.(stableId) ?? stableId;
			return this.generateNodeId(convertedStableId);
		};

		return Array.from(
			edits as unknown as Iterable<Edit<ChangeInternal>>,
			(edit) => this.applyEditInternal(convertEditIds(edit, (id) => idConverter(id))).id
		);
	}

	/**
	 * Applies a set of internal changes to this tree. The result will be reflected in `SharedTree.currentView`.
	 * External users should use one of the more specialized functions, like `applyEdit` which handles constructing the actual `Edit`
	 * and uses public Change types.
	 * This is exposed for internal use only.
	 */
	public applyEditInternal(editOrChanges: Edit<ChangeInternal> | readonly ChangeInternal[]): Edit<ChangeInternal> {
		let edit: Edit<ChangeInternal>;
		if (Array.isArray(editOrChanges)) {
			const id = newEditId();
			edit = { id, changes: editOrChanges };
		} else {
			edit = editOrChanges as Edit<ChangeInternal>;
		}
		this.submitEditOp(edit);
		this.applyEditLocally(edit, undefined);
		return edit;
	}

	/**
	 * Converts a public Change type to an internal representation.
	 * This is exposed for internal use only.
	 */
	public internalizeChange(change: Change): ChangeInternal {
		switch (change.type) {
			case ChangeType.Insert:
				return {
					source: change.source as DetachedSequenceId,
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
				if (isTreeNodeSequence(change.source)) {
					const source = change.source.map((buildNode) =>
						convertTreeNodes<BuildTreeNode, TreeNode<BuildNodeInternal, NodeId>, number>(
							buildNode,
							(nodeData) => internalizeBuildNode(nodeData, this),
							(x): x is number => typeof x === 'number'
						)
					) as TreeNodeSequence<TreeNode<BuildNodeInternal, NodeId> | DetachedSequenceId>;
					return {
						source,
						destination: change.destination as DetachedSequenceId,
						type: ChangeTypeInternal.Build,
					};
				} else {
					const source = convertTreeNodes<BuildTreeNode, TreeNode<BuildNodeInternal, NodeId>, number>(
						change.source,
						(nodeData) => internalizeBuildNode(nodeData, this),
						(x): x is number => typeof x === 'number'
					) as TreeNode<BuildNodeInternal, NodeId> | DetachedSequenceId;
					return {
						source: [source],
						destination: change.destination as DetachedSequenceId,
						type: ChangeTypeInternal.Build,
					};
				}
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
					toConstrain: change.toConstrain,
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

	private applyEditLocally(edit: Edit<ChangeInternal>, message: ISequencedDocumentMessage | undefined): void {
		const isSequenced = message !== undefined;
		if (isSequenced) {
			this.editLog.addSequencedEdit(edit, message);
		} else {
			this.editLog.addLocalEdit(edit);
		}

		const eventArguments: EditCommittedEventArguments = {
			editId: edit.id,
			local: !isSequenced,
			tree: this,
		};
		this.emit(SharedTreeEvent.EditCommitted, eventArguments);
	}

	/**
	 * Reverts a previous edit by applying a new edit containing the inverse of the original edit's changes.
	 * @param editId - the edit to revert
	 * @returns the id of the new edit, or undefined if the original edit could not be inverted given the current tree state.
	 */
	public revert(editId: EditId): EditId | undefined {
		const index = this.edits.getIndexOfId(editId);
		const edit = this.edits.tryGetEditAtIndex(index) ?? fail('edit not found');
		const before = this.logViewer.getRevisionViewInMemory(index);
		const changes = this.revertChanges(edit.changes, before);
		if (changes === undefined) {
			return undefined;
		}

		return this.applyEditInternal(changes).id;
	}

	/**
	 * Revert the given changes
	 * @param changes - the changes to revert
	 * @param before - the revision view before the changes were originally applied
	 * @returns the inverse of `changes` or undefined if the changes could not be inverted for the given tree state.
	 */
	public revertChanges(changes: readonly InternalizedChange[], before: RevisionView): ChangeInternal[] | undefined {
		return revert(changes as unknown as readonly ChangeInternal[], before, this.logger, this.emit.bind(this));
	}

	/**
	 * Submits an edit by the local client to the runtime.
	 */
	private submitEditOp(edit: Edit<ChangeInternal>): void {
		// Only submit ops if attached, since op submission can have stateful side effects (e.g. changing the IdCompressor)
		// Ops will be submitted again when attached (see loadSummary())
		if (this.isAttached()) {
			switch (this.writeFormat) {
				case WriteFormat.v0_0_2:
					this.submitOp(this.encoder_0_0_2.encodeEditOp(edit, (x) => x, this));
					break;
				case WriteFormat.v0_1_1:
					this.submitOp(
						this.encoder_0_1_1.encodeEditOp(
							edit,
							(x) => x,
							this.idCompressor.takeNextCreationRange(),
							this.idNormalizer,
							this.interner
						)
					);
					break;
				default:
					fail('Unknown version');
			}
		}
	}

	/** A type-safe `submitLocalMessage` wrapper to enforce op format */
	private submitOp(content: SharedTreeOp | SharedTreeOp_0_0_2, localOpMetadata: unknown = undefined): void {
		assert(
			compareSummaryFormatVersions(content.version, this.writeFormat) === 0,
			0x631 /* Attempted to submit op of wrong version */
		);
		this.submitLocalMessage(content, localOpMetadata);
	}

	public getRuntime(): IFluidDataStoreRuntime {
		return this.runtime;
	}

	/**
	 * "Pending local state" refers to ops submitted to the runtime that have not yet been acked.
	 * When closing a container, hosts have the option to stash this pending local state somewhere to be reapplied
	 * later (to avoid data loss).
	 * If a host then loads a container using that stashed state, this function is called for each stashed op, and is expected to:
	 * Update this DDS to reflect that state locally, and submit the op to do that.
	 *
	 * @param content - op to apply locally.
	 */
	protected applyStashedOp(op: unknown): void {
		// In some scenarios, edit ops need to have their edits transformed before application and resubmission. The transformation
		// occurs in this method, and the result is passed to `resubmitCore` via the return value of this function.
		const sharedTreeOp = op as SharedTreeOp | SharedTreeOp_0_0_2;
		switch (sharedTreeOp.type) {
			case SharedTreeOpType.Edit: {
				let stashedEdit: Edit<ChangeInternal> | undefined;
				switch (this.writeFormat) {
					case WriteFormat.v0_0_2:
						switch (sharedTreeOp.version) {
							case WriteFormat.v0_0_2: {
								stashedEdit = this.parseSequencedEdit(sharedTreeOp);
								break;
							}
							case WriteFormat.v0_1_1:
								fail('Received stashed op 0.1.1 before upgrade');
							default:
								fail('Unknown version');
						}
						break;
					case WriteFormat.v0_1_1:
						switch (sharedTreeOp.version) {
							case WriteFormat.v0_0_2: {
								// Use the IDs from the stashed ops as overrides for the equivalent new ops
								stashedEdit = convertEditIds(sharedTreeOp.edit, (id) => this.generateNodeId(id));
								break;
							}
							case WriteFormat.v0_1_1: {
								assert(this.stashedIdCompressor !== null, 0x632 /* Stashed op applied after expected window */);
								if (this.stashedIdCompressor === undefined) {
									// Use a temporary compressor that will help translate the stashed ops
									this.stashedIdCompressor = IdCompressor.deserialize(
										this.idCompressor.serialize(false),
										stashedSessionId,
										sharedTreeOp.idRange.attributionId
									);
									// Once all stashed ops have been applied, clear the temporary state
									this.runtime.on('connected', () => {
										this.stashedIdCompressor = null;
									});
								}
								// Pretend (from the perspective of the temporary compressor) that the stashed ops have been sequenced
								this.stashedIdCompressor.finalizeCreationRange(sharedTreeOp.idRange);
								const stashedIdContext = getNodeIdContext(this.stashedIdCompressor);
								// Use a normalizer to translate all node IDs in the stashed ops
								const normalizer: NodeIdNormalizer<OpSpaceNodeId> = {
									localSessionId: this.idCompressor.localSessionId,
									normalizeToSessionSpace: (id, _sessionId) => {
										// Interpret the IDs from the stashed ops as stable IDs, and use those as overrides for the equivalent new ops
										const sessionSpaceId = stashedIdContext.normalizeToSessionSpace(id, sharedTreeOp.idRange.sessionId);
										return this.generateNodeId(stashedIdContext.convertToStableNodeId(sessionSpaceId));
									},
									normalizeToOpSpace: (id) => this.idNormalizer.normalizeToOpSpace(id),
								};

								stashedEdit = this.encoder_0_1_1.decodeEditOp(sharedTreeOp, (x) => x, normalizer, this.interner);
								break;
							}
							default:
								fail('Unknown version');
						}
						break;
					default:
						fail('Unknown version');
				}
				this.applyEditInternal(stashedEdit);
				return;
			}
			// Handle and update ops are only acknowledged by the client that generated them upon sequencing--no local changes necessary.
			case SharedTreeOpType.Handle:
			case SharedTreeOpType.Update:
			case SharedTreeOpType.NoOp:
				return;
			default:
				fail('Unrecognized op');
		}
	}

	protected reSubmitCore(op: unknown, localOpMetadata?: StashedLocalOpMetadata): void {
		const sharedTreeOp = op as SharedTreeOp | SharedTreeOp_0_0_2;
		switch (sharedTreeOp.type) {
			case SharedTreeOpType.Edit:
				if (compareSummaryFormatVersions(sharedTreeOp.version, this.writeFormat) > 0) {
					fail('Attempted to resubmit op of version newer than current version');
				} else if (localOpMetadata?.transformedEdit !== undefined) {
					// Optimization: stashed 0.0.2 ops require no transformation in 0.0.2; don't re-encode
					if (this.writeFormat !== WriteFormat.v0_0_2 || sharedTreeOp.version !== WriteFormat.v0_0_2) {
						this.submitEditOp(localOpMetadata.transformedEdit);
						return;
					}
				}
				break;
			default:
				break;
		}
		super.reSubmitCore(sharedTreeOp, localOpMetadata);
	}

	private changeWriteFormat(newFormat: WriteFormat): void {
		this.writeFormat = newFormat;
		this.emit(SharedTreeDiagnosticEvent.WriteVersionChanged, newFormat);
	}

	/**
	 * Interns all Definitions and TraitLabel_s referenced by the provided edit.
	 *
	 * Clients must have consensus on the interned values to guarantee the interned ID is valid.
	 */
	private internStringsFromEdit(edit: Edit<ChangeInternal>): void {
		for (const change of edit.changes) {
			if (change.type === ChangeTypeInternal.Build) {
				for (const root of change.source) {
					walkTree<TreeNode<BuildNodeInternal, NodeId>, DetachedSequenceId>(
						root,
						(node) => {
							this.interner.getOrCreateInternedId(node.definition);
							for (const trait of Object.keys(node.traits)) {
								this.interner.getOrCreateInternedId(trait);
							}
						},
						isDetachedSequenceId
					);
				}
			} else if (change.type === ChangeTypeInternal.Insert) {
				const { referenceTrait } = change.destination;
				if (referenceTrait !== undefined) {
					this.interner.getOrCreateInternedId(referenceTrait.label);
				}
			}
		}
	}
}

/**
 * @returns 1 if versionA is newer, -1 if versionB is newer, and 0 if the versions are the same.
 * @throws if either version isn't a valid WriteFormat version.
 */
function compareSummaryFormatVersions(versionA: string, versionB: string): number {
	const versionAIndex = sortedWriteVersions.indexOf(versionA as WriteFormat);
	const versionBIndex = sortedWriteVersions.indexOf(versionB as WriteFormat);

	if (versionAIndex === -1 || versionBIndex === -1) {
		fail('Summary version being compared cannot be read.');
	}

	if (versionAIndex < versionBIndex) {
		return -1;
	} else if (versionAIndex > versionBIndex) {
		return 1;
	}

	return 0;
}

/**
 * Checks if the summary version needs to be updated.
 * @returns true if the old version is older than the new version.
 * @throws if the new version isn't a supported WriteFormat version.
 */
function isUpdateRequired(oldVersion: string, newVersion: string): boolean {
	const newVersionIndex = sortedWriteVersions.indexOf(newVersion as WriteFormat);
	if (newVersionIndex === -1) {
		fail('New write version is invalid.');
	}

	return compareSummaryFormatVersions(oldVersion, newVersion) === -1 ? true : false;
}

function isTreeNodeSequence(source: TreeNodeSequence<BuildNode> | BuildNode): source is TreeNodeSequence<BuildNode> {
	return Array.isArray(source);
}
