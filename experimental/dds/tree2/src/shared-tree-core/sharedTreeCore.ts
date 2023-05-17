/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { isStableId } from "@fluidframework/container-runtime";
import {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import {
	IFluidSerializer,
	ISharedObjectEvents,
	SharedObject,
} from "@fluidframework/shared-object-base";
import { v4 as uuid } from "uuid";
import { IMultiFormatCodec } from "../codec";
import {
	ChangeFamily,
	AnchorSet,
	Delta,
	RevisionTag,
	RepairDataStore,
	ChangeFamilyEditor,
	IRepairDataStoreProvider,
	mintRevisionTag,
	GraphCommit,
} from "../core";
import { brand, isJsonObject, JsonCompatibleReadOnly, TransactionResult } from "../util";
import { createEmitter, TransformEvents } from "../events";
import { SharedTreeBranch } from "./branch";
import { EditManagerSummarizer } from "./editManagerSummarizer";
import { Commit, EditManager, SeqNumber, minimumPossibleSequenceNumber } from "./editManager";

/**
 * The events emitted by a {@link SharedTreeCore}
 *
 * TODO: Add/remove events
 */
export interface ISharedTreeCoreEvents {
	updated: () => void;
}

// TODO: How should the format version be determined?
const formatVersion = 0;
// TODO: Organize this to be adjacent to persisted types.
const summarizablesTreeKey = "indexes";

/**
 * Events which result from the state of the tree changing.
 * These are for internal use by the tree.
 */
export interface ChangeEvents<TChangeset> {
	/**
	 * @param change - change that was just sequenced.
	 * @param derivedFromLocal - iff provided, change was a local change (from this session)
	 * which is now sequenced (and thus no longer local).
	 */
	newSequencedChange: (change: TChangeset, derivedFromLocal?: TChangeset) => void;

	/**
	 * @param change - change that was just applied locally.
	 */
	newLocalChange: (change: TChangeset) => void;

	/**
	 * @param changeDelta - composed changeset from previous local state
	 * (state after all sequenced then local changes are accounted for) to current local state.
	 * May involve effects of a new sequenced change (including rebasing of local changes onto it),
	 * or a new local change. Called after either sequencedChange or newLocalChange.
	 */
	newLocalState: (changeDelta: Delta.Root) => void;
}

/**
 * Generic shared tree, which needs to be configured with indexes, field kinds and a history policy to be used.
 *
 * TODO: actually implement
 * TODO: is history policy a detail of what indexes are used, or is there something else to it?
 */
export class SharedTreeCore<TEditor extends ChangeFamilyEditor, TChange> extends SharedObject<
	TransformEvents<ISharedTreeCoreEvents, ISharedObjectEvents>
> {
	private readonly editManager: EditManager<TEditor, TChange, ChangeFamily<TEditor, TChange>>;
	private readonly summarizables: readonly Summarizable[];

	/**
	 * The sequence number that this instance is at.
	 * This is number is artificial in that it is made up by this instance as opposed to being provided by the runtime.
	 * Is `undefined` after (and only after) this instance is attached.
	 */
	private detachedRevision: SeqNumber | undefined = minimumPossibleSequenceNumber;

	/**
	 * Provides internal events that result from changes to the tree
	 */
	protected readonly changeEvents = createEmitter<ChangeEvents<TChange>>();

	/**
	 * Used to edit the state of the tree. Edits will be immediately applied locally to the tree.
	 * If there is no transaction currently ongoing, then the edits will be submitted to Fluid immediately as well.
	 */
	public readonly editor: TEditor;

	/**
	 * Used to encode and decode changes.
	 *
	 * @remarks - Since there is currently only one format, this can just be cached on the class.
	 * With more write formats active, it may make sense to keep around the "usual" format codec
	 * (the one for the current persisted configuration) and resolve codecs for different versions
	 * as necessary (e.g. an upgrade op came in, or the configuration changed within the collab window
	 * and an op needs to be interpreted which isn't written with the current configuration).
	 */
	private readonly changeCodec: IMultiFormatCodec<TChange>;

	/**
	 * @param summarizables - Summarizers for all indexes used by this tree
	 * @param changeFamily - The change family
	 * @param editManager - The edit manager
	 * @param anchors - The anchor set
	 * @param id - The id of the shared object
	 * @param runtime - The IFluidDataStoreRuntime which contains the shared object
	 * @param attributes - Attributes of the shared object
	 * @param telemetryContextPrefix - the context for any telemetry logs/errors emitted
	 */
	public constructor(
		summarizables: readonly Summarizable[],
		private readonly changeFamily: ChangeFamily<TEditor, TChange>,
		anchors: AnchorSet,
		repairDataStoreProvider: IRepairDataStoreProvider,
		// Base class arguments
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		telemetryContextPrefix: string,
	) {
		super(id, runtime, attributes, telemetryContextPrefix);

		/**
		 * A random ID that uniquely identifies this client in the collab session.
		 * This is sent alongside every op to identify which client the op originated from.
		 * This is used rather than the Fluid client ID because the Fluid client ID is not stable across reconnections.
		 */
		// TODO: Change this type to be the Session ID type provided by the IdCompressor when available.
		const localSessionId = uuid();
		this.editManager = new EditManager(
			changeFamily,
			localSessionId,
			repairDataStoreProvider,
			anchors,
		);
		this.editManager.on("newTrunkHead", (head) => {
			this.changeEvents.emit("newSequencedChange", head.change);
		});
		this.editor = changeFamily.buildEditor((change) => {
			const [branchChange, newCommit] = this.editManager.localBranch.apply(
				change,
				mintRevisionTag(),
			);
			if (!this.isTransacting()) {
				this.submitCommit(newCommit);
			}
			this.changeEvents.emit("newLocalChange", branchChange);
		}, new AnchorSet());

		// When the local branch changes, notify our listeners of the new state.
		this.editManager.localBranch.on("change", ({ change }) => {
			if (change !== undefined) {
				this.changeEvents.emit("newLocalState", this.changeFamily.intoDelta(change));
			}
		});

		this.summarizables = [
			new EditManagerSummarizer(runtime, this.editManager),
			...summarizables,
		];
		assert(
			new Set(this.summarizables.map((e) => e.key)).size === this.summarizables.length,
			0x350 /* Index summary element keys must be unique */,
		);

		this.changeCodec = changeFamily.codecs.resolve(formatVersion);
	}

	// TODO: SharedObject's merging of the two summary methods into summarizeCore is not what we want here:
	// We might want to not subclass it, or override/reimplement most of its functionality.
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		const summarizableBuilder = new SummaryTreeBuilder();
		// Merge the summaries of all summarizables together under a single ISummaryTree
		for (const s of this.summarizables) {
			summarizableBuilder.addWithStats(
				s.key,
				s.getAttachSummary(
					(contents) => serializer.stringify(contents, this.handle),
					undefined,
					undefined,
					telemetryContext,
				),
			);
		}

		builder.addWithStats(summarizablesTreeKey, summarizableBuilder.getSummaryTree());
		return builder.getSummaryTree();
	}

	protected async loadCore(services: IChannelStorageService): Promise<void> {
		const loadSummaries = this.summarizables.map(async (summaryElement) =>
			summaryElement.load(
				scopeStorageService(services, summarizablesTreeKey, summaryElement.key),
				(contents) => this.serializer.parse(contents),
			),
		);

		await Promise.all(loadSummaries);
	}

	/**
	 * Submits an op to the Fluid runtime containing the given commit
	 * @param commit - the commit to submit
	 */
	private submitCommit(commit: GraphCommit<TChange>): void {
		// Edits should not be submitted until all transactions finish
		assert(!this.isTransacting(), "Unexpected edit submitted during transaction");

		// Edits submitted before the first attach are treated as sequenced because they will be included
		// in the attach summary that is uploaded to the service.
		// Until this attach workflow happens, this instance essentially behaves as a centralized data structure.
		if (this.detachedRevision !== undefined) {
			const newRevision: SeqNumber = brand((this.detachedRevision as number) + 1);
			this.detachedRevision = newRevision;
			this.editManager.addSequencedChange(
				{ ...commit, sessionId: this.editManager.localSessionId },
				newRevision,
				this.detachedRevision,
			);
		}
		const message: Message = {
			revision: commit.revision,
			originatorId: this.editManager.localSessionId,
			changeset: this.changeCodec.json.encode(commit.change),
		};
		this.submitLocalMessage(message);
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		const commit = parseCommit(message.contents, this.changeCodec);

		this.editManager.addSequencedChange(
			commit,
			brand(message.sequenceNumber),
			brand(message.referenceSequenceNumber),
		);

		this.editManager.advanceMinimumSequenceNumber(brand(message.minimumSequenceNumber));
	}

	protected startTransaction(repairStore?: RepairDataStore): void {
		this.editManager.localBranch.startTransaction(repairStore);
		this.editor.enterTransaction();
	}

	protected commitTransaction(): TransactionResult.Commit {
		const [_, newCommit] = this.editManager.localBranch.commitTransaction();
		this.editor.exitTransaction();
		if (!this.isTransacting()) {
			this.submitCommit(newCommit);
		}
		return TransactionResult.Commit;
	}

	protected abortTransaction(): TransactionResult.Abort {
		this.editManager.localBranch.abortTransaction();
		this.editor.exitTransaction();
		return TransactionResult.Abort;
	}

	protected isTransacting(): boolean {
		return this.editManager.localBranch.isTransacting();
	}

	/**
	 * Undoes the last completed transaction made by the client.
	 * It is invalid to call it while a transaction is open (this will be supported in the future).
	 */
	public undo(): void {
		const result = this.editManager.localBranch.undo();
		if (result !== undefined) {
			const [change, newCommit] = result;
			this.submitCommit(newCommit);
			this.changeEvents.emit("newLocalChange", change);
		}
	}

	/**
	 * Redoes the last completed undo made by the client.
	 * It is invalid to call it while a transaction is open (this will be supported in the future).
	 */
	public redo(): void {
		const result = this.editManager.localBranch.redo();
		if (result !== undefined) {
			const [change, newCommit] = result;
			this.submitCommit(newCommit);
			this.changeEvents.emit("newLocalChange", change);
		}
	}

	/**
	 * Spawns a `SharedTreeBranch` that is based on the current state of the tree.
	 * This can be used to support asynchronous checkouts of the tree.
	 * @remarks
	 * Branches are valid until they are disposed. Branches should be disposed when
	 * they are no longer needed because it allows `SharedTreeCore` to free memory.
	 * Branches are no longer guaranteed to be based off of the trunk once disposed.
	 */
	protected forkBranch(
		repairDataStoreProvider: IRepairDataStoreProvider,
		anchors?: AnchorSet,
	): SharedTreeBranch<TEditor, TChange> {
		return this.editManager.localBranch.fork(repairDataStoreProvider, anchors);
	}

	/**
	 * Merges the commits of the given branch into the root local branch.
	 * This behaves as if all divergent commits on the branch were applied to the root local branch one at a time.
	 * @param branch - the branch to merge
	 */
	protected mergeBranch(branch: SharedTreeBranch<TEditor, TChange>): void {
		const result = this.editManager.localBranch.merge(branch);
		if (result !== undefined) {
			const [change, newCommits] = result;
			if (!this.isTransacting()) {
				for (const c of newCommits) {
					this.submitCommit(c);
				}
			}
			this.changeEvents.emit("newLocalChange", change);
		}
	}

	/**
	 * @returns the head commit of the root local branch
	 */
	protected getLocalBranch(): SharedTreeBranch<TEditor, TChange> {
		return this.editManager.localBranch;
	}

	protected onDisconnect() {}

	protected override didAttach(): void {
		if (this.detachedRevision !== undefined) {
			this.detachedRevision = undefined;
		}
	}

	protected override reSubmitCore(content: JsonCompatibleReadOnly, localOpMetadata: unknown) {
		const { revision } = parseCommit(content, this.changeCodec);
		const [commit] = this.editManager.findLocalCommit(revision);
		this.submitCommit(commit);
	}

	protected applyStashedOp(content: JsonCompatibleReadOnly): undefined {
		assert(
			!this.isTransacting(),
			0x674 /* Unexpected transaction is open while applying stashed ops */,
		);
		const { revision, change } = parseCommit(content, this.changeCodec);
		const [branchChange] = this.editManager.localBranch.apply(change, revision);
		this.changeEvents.emit("newLocalChange", branchChange);
		return;
	}

	public override getGCData(fullGC?: boolean): IGarbageCollectionData {
		const gcNodes: IGarbageCollectionData["gcNodes"] = {};
		for (const s of this.summarizables) {
			for (const [id, routes] of Object.entries(s.getGCData(fullGC).gcNodes)) {
				gcNodes[id] ??= [];
				for (const route of routes) {
					gcNodes[id].push(route);
				}
			}
		}

		return {
			gcNodes,
		};
	}
}

/**
 * The format of messages that SharedTree sends and receives.
 */
interface Message {
	/**
	 * The revision tag for the change in this message
	 */
	readonly revision: RevisionTag;
	/**
	 * The stable ID that identifies the originator of the message.
	 */
	readonly originatorId: string;
	/**
	 * The changeset to be applied.
	 */
	readonly changeset: JsonCompatibleReadOnly;
}

/**
 * Specifies the behavior of a component that puts data in a summary.
 */
export interface Summarizable {
	/**
	 * Field name in summary json under which this element stores its data.
	 */
	readonly key: string;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getAttachSummary}
	 * @param stringify - Serializes the contents of the component (including {@link IFluidHandle}s) for storage.
	 */
	getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 * @param stringify - Serializes the contents of the component (including {@link IFluidHandle}s) for storage.
	 */
	summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats>;

	/**
	 * {@inheritDoc (ISharedObject:interface).getGCData}
	 */
	// TODO: Change this interface (and the one in ISharedObject, if necessary) to support "handles within handles".
	// Consider the case of a document with history; the return value here currently grows unboundedly.
	getGCData(fullGC?: boolean): IGarbageCollectionData;

	/**
	 * Allows the component to perform custom loading. The storage service is scoped to this component and therefore
	 * paths in this component will not collide with those in other components, even if they are the same string.
	 * @param service - Storage used by the component
	 * @param parse - Parses serialized data from storage into runtime objects for the component
	 */
	load(service: IChannelStorageService, parse: SummaryElementParser): Promise<void>;
}

/**
 * Serializes the given contents into a string acceptable for storing in summaries, i.e. all
 * Fluid handles have been replaced appropriately by an IFluidSerializer
 */
export type SummaryElementStringifier = (contents: unknown) => string;

/**
 * Parses a serialized/summarized string into an object, rehydrating any Fluid handles as necessary
 */
export type SummaryElementParser = (contents: string) => unknown;

/**
 * Compose an {@link IChannelStorageService} which prefixes all paths before forwarding them to the original service
 */
function scopeStorageService(
	service: IChannelStorageService,
	...pathElements: string[]
): IChannelStorageService {
	const scope = `${pathElements.join("/")}/`;

	return {
		async readBlob(path: string): Promise<ArrayBufferLike> {
			return service.readBlob(`${scope}${path}`);
		},
		async contains(path) {
			return service.contains(`${scope}${path}`);
		},
		async list(path) {
			return service.list(`${scope}${path}`);
		},
	};
}

/**
 * validates that the message contents is an object which contains valid revisionId, sessionId, and changeset and returns a Commit
 * @param content - message contents
 * @returns a Commit object
 */
function parseCommit<TChange>(
	content: JsonCompatibleReadOnly,
	codec: IMultiFormatCodec<TChange>,
): Commit<TChange> {
	assert(isJsonObject(content), 0x5e4 /* expected content to be an object */);
	assert(
		typeof content.revision === "string" && isStableId(content.revision),
		0x5e5 /* expected revision id to be valid stable id */,
	);
	assert(content.changeset !== undefined, 0x5e7 /* expected changeset to be defined */);
	assert(typeof content.originatorId === "string", 0x5e8 /* expected changeset to be defined */);
	const change = codec.json.decode(content.changeset);
	return { revision: content.revision, sessionId: content.originatorId, change };
}
