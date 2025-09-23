/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import type {
	IExperimentalIncrementalSummaryContext,
	IRuntimeMessageCollection,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import type {
	IChannelView,
	IFluidSerializer,
} from "@fluidframework/shared-object-base/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import type { ICodecOptions, IJsonCodec } from "../codec/index.js";
import {
	type ChangeFamily,
	type ChangeFamilyEditor,
	type GraphCommit,
	type RevisionTag,
	RevisionTagCodec,
	type SchemaAndPolicy,
	type SchemaPolicy,
	type TaggedChange,
	type TreeStoredSchemaRepository,
} from "../core/index.js";
import {
	type JsonCompatibleReadOnly,
	brand,
	type Breakable,
	type WithBreakable,
	throwIfBroken,
	breakingClass,
} from "../util/index.js";

import type { BranchId, SharedTreeBranch } from "./branch.js";
import { BranchCommitEnricher } from "./branchCommitEnricher.js";
import { type ChangeEnricherReadonlyCheckout, NoOpChangeEnricher } from "./changeEnricher.js";
import { DefaultResubmitMachine } from "./defaultResubmitMachine.js";
import { EditManager, minimumPossibleSequenceNumber } from "./editManager.js";
import { makeEditManagerCodec } from "./editManagerCodecs.js";
import type { SeqNumber } from "./editManagerFormatCommons.js";
import { EditManagerSummarizer } from "./editManagerSummarizer.js";
import { type MessageEncodingContext, makeMessageCodec } from "./messageCodecs.js";
import type { DecodedMessage } from "./messageTypes.js";
import type { ResubmitMachine } from "./resubmitMachine.js";

// TODO: Organize this to be adjacent to persisted types.
const summarizablesTreeKey = "indexes";

export interface ExplicitCoreCodecVersions {
	editManager: number;
	message: number;
}

export interface ClonableSchemaAndPolicy extends SchemaAndPolicy {
	schema: TreeStoredSchemaRepository;
}

/**
 * Generic shared tree, which needs to be configured with indexes, field kinds and other configuration.
 */
@breakingClass
export class SharedTreeCore<TEditor extends ChangeFamilyEditor, TChange>
	implements WithBreakable
{
	private readonly editManager: EditManager<TEditor, TChange, ChangeFamily<TEditor, TChange>>;
	private readonly summarizables: readonly [EditManagerSummarizer<TChange>, ...Summarizable[]];
	/**
	 * The sequence number that this instance is at.
	 * This number is artificial in that it is made up by this instance as opposed to being provided by the runtime.
	 * Is `undefined` after (and only after) this instance is attached.
	 */
	private detachedRevision: SeqNumber | undefined = minimumPossibleSequenceNumber;

	/**
	 * Used to encode/decode messages sent to/received from the Fluid runtime.
	 *
	 * @remarks Since there is currently only one format, this can just be cached on the class.
	 * With more write formats active, it may make sense to keep around the "usual" format codec
	 * (the one for the current persisted configuration) and resolve codecs for different versions
	 * as necessary (e.g. an upgrade op came in, or the configuration changed within the collab window
	 * and an op needs to be interpreted which isn't written with the current configuration).
	 */
	private readonly messageCodec: IJsonCodec<
		DecodedMessage<TChange>,
		unknown,
		unknown,
		MessageEncodingContext
	>;

	private readonly enrichers: Map<BranchId, EnricherState<TChange>> = new Map();

	public readonly mintRevisionTag: () => RevisionTag;

	private readonly schemaAndPolicy: ClonableSchemaAndPolicy;

	/**
	 * @param summarizables - Summarizers for all indexes used by this tree
	 * @param changeFamily - The change family
	 * @param editManager - The edit manager
	 * @param runtime - The IFluidDataStoreRuntime which contains the shared object
	 * @param editor - Used to edit the state of the tree. Edits will be immediately applied locally to the tree.
	 * If there is no transaction currently ongoing, then the edits will be submitted to Fluid immediately as well.
	 */
	public constructor(
		public readonly breaker: Breakable,
		public readonly sharedObject: IChannelView & IFluidLoadable,
		public readonly serializer: IFluidSerializer,
		public readonly submitLocalMessage: (content: unknown, localOpMetadata?: unknown) => void,
		logger: ITelemetryBaseLogger | undefined,
		summarizables: readonly Summarizable[],
		protected readonly changeFamily: ChangeFamily<TEditor, TChange>,
		options: ICodecOptions,
		formatOptions: ExplicitCoreCodecVersions,
		protected readonly idCompressor: IIdCompressor,
		schema: TreeStoredSchemaRepository,
		schemaPolicy: SchemaPolicy,
		resubmitMachine?: ResubmitMachine<TChange>,
		enricher?: ChangeEnricherReadonlyCheckout<TChange>,
		public readonly getEditor: () => TEditor = () => this.getLocalBranch().editor,
	) {
		this.schemaAndPolicy = {
			schema,
			policy: schemaPolicy,
		};

		const rebaseLogger = createChildLogger({
			logger,
			namespace: "Rebase",
		});

		this.mintRevisionTag = () => this.idCompressor.generateCompressedId();
		/**
		 * A random ID that uniquely identifies this client in the collab session.
		 * This is sent alongside every op to identify which client the op originated from.
		 * This is used rather than the Fluid client ID because the Fluid client ID is not stable across reconnections.
		 */
		const localSessionId = idCompressor.localSessionId;
		this.editManager = new EditManager(
			changeFamily,
			localSessionId,
			this.mintRevisionTag,
			rebaseLogger,
		);

		this.registerSharedBranch("main");

		const revisionTagCodec = new RevisionTagCodec(idCompressor);
		const editManagerCodec = makeEditManagerCodec(
			this.editManager.changeFamily.codecs,
			revisionTagCodec,
			options,
			formatOptions.editManager,
		);
		this.summarizables = [
			new EditManagerSummarizer(
				this.editManager,
				editManagerCodec,
				this.idCompressor,
				this.schemaAndPolicy,
			),
			...summarizables,
		];
		assert(
			new Set(this.summarizables.map((e) => e.key)).size === this.summarizables.length,
			0x350 /* Index summary element keys must be unique */,
		);

		this.messageCodec = makeMessageCodec(
			changeFamily.codecs,
			new RevisionTagCodec(idCompressor),
			options,
			formatOptions.message,
		);

		this.registerSharedBranchForEditing(
			"main",
			enricher ?? new NoOpChangeEnricher(),
			resubmitMachine,
		);
	}

	// TODO: SharedObject's merging of the two summary methods into summarizeCore is not what we want here:
	// We might want to not subclass it, or override/reimplement most of its functionality.
	@throwIfBroken
	public summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
		fullTree?: boolean,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		const summarizableBuilder = new SummaryTreeBuilder();
		// Merge the summaries of all summarizables together under a single ISummaryTree
		for (const s of this.summarizables) {
			// Add the summarizable's path in the summary tree to the incremental summary context's
			// summary path, so that the summarizable can use it to generate incremental summaries.
			const childIncrementalSummaryContext =
				incrementalSummaryContext === undefined
					? undefined
					: {
							...incrementalSummaryContext,
							summaryPath: `${incrementalSummaryContext.summaryPath}/${summarizablesTreeKey}/${s.key}`,
						};
			summarizableBuilder.addWithStats(
				s.key,
				s.summarize({
					stringify: (contents: unknown) =>
						serializer.stringify(contents, this.sharedObject.handle),
					fullTree,
					telemetryContext,
					incrementalSummaryContext: childIncrementalSummaryContext,
				}),
			);
		}

		builder.addWithStats(summarizablesTreeKey, summarizableBuilder.getSummaryTree());
		return builder.getSummaryTree();
	}

	public async loadCore(services: IChannelStorageService): Promise<void> {
		assert(
			this.getLocalBranch().getHead() === this.editManager.getTrunkHead("main"),
			0xaaa /* All local changes should be applied to the trunk before loading from summary */,
		);
		const [editManagerSummarizer, ...summarizables] = this.summarizables;
		const loadEditManager = this.loadSummarizable(editManagerSummarizer, services);
		const loadSummarizables = summarizables.map(async (s) =>
			this.loadSummarizable(s, services),
		);

		if (this.detachedRevision !== undefined) {
			// If we are detached but loading from a summary, then we need to update our detached revision to ensure that it is ahead of all detached revisions in the summary.
			// First, finish loading the edit manager so that we can inspect the sequence numbers of the commits on the trunk.
			await loadEditManager;

			const latestDetachedSequenceNumber = this.editManager.getLatestSequenceNumber();
			// When we load a summary for a tree that was never attached,
			// latestDetachedSequenceNumber is either undefined (no commits in summary) or negative (all commits in summary were made while detached).
			// We only need to update `this.detachedRevision` in the latter case.
			if (latestDetachedSequenceNumber !== undefined && latestDetachedSequenceNumber < 0) {
				this.detachedRevision = latestDetachedSequenceNumber;
			}
			await Promise.all(loadSummarizables);
		} else {
			await Promise.all([loadEditManager, ...loadSummarizables]);
		}
	}

	private registerSharedBranch(branchId: BranchId): void {
		this.editManager.getLocalBranch(branchId).events.on("beforeChange", (change) => {
			if (change.type === "append") {
				if (this.detachedRevision === undefined) {
					// Commit enrichment is only necessary for changes that will be submitted as ops, and changes issued while detached are not submitted.
					this.getCommitEnricher(branchId).processChange(change);
				}

				for (const commit of change.newCommits) {
					this.submitCommit(branchId, commit, this.schemaAndPolicy, false);
				}
			}
		});
	}

	private async loadSummarizable(
		summarizable: Summarizable,
		services: IChannelStorageService,
	): Promise<void> {
		return summarizable.load(
			scopeStorageService(services, summarizablesTreeKey, summarizable.key),
			(contents) => this.serializer.parse(contents),
		);
	}

	/**
	 * Submits an op to the Fluid runtime containing the given commit
	 * @param commit - the commit to submit
	 * @returns the submitted commit. This is undefined if the underlying `SharedObject` is not attached,
	 * and may differ from `commit` due to enrichments like detached tree refreshers.
	 */
	protected submitCommit(
		branchId: BranchId,
		commit: GraphCommit<TChange>,
		schemaAndPolicy: ClonableSchemaAndPolicy,
		isResubmit: boolean,
	): void {
		assert(
			this.sharedObject.isAttached() === (this.detachedRevision === undefined),
			0x95a /* Detached revision should only be set when not attached */,
		);

		const enrichedCommit =
			this.detachedRevision === undefined && !isResubmit
				? this.getCommitEnricher(branchId).enrich(commit)
				: commit;

		// Edits submitted before the first attach are treated as sequenced because they will be included
		// in the attach summary that is uploaded to the service.
		// Until this attach workflow happens, this instance essentially behaves as a centralized data structure.
		if (this.detachedRevision !== undefined) {
			const newRevision: SeqNumber = brand((this.detachedRevision as number) + 1);
			this.detachedRevision = newRevision;
			this.editManager.addSequencedChanges(
				[enrichedCommit],
				this.editManager.localSessionId,
				newRevision,
				this.detachedRevision,
			);
			this.editManager.advanceMinimumSequenceNumber(newRevision, false);
			return undefined;
		}

		this.submitMessage(
			{
				type: "commit",
				commit: enrichedCommit,
				sessionId: this.editManager.localSessionId,
				branchId,
			},
			schemaAndPolicy,
		);

		this.getResubmitMachine(branchId).onCommitSubmitted(enrichedCommit);
	}

	protected submitBranchCreation(branchId: BranchId): void {
		this.submitMessage(
			{ type: "branch", sessionId: this.editManager.localSessionId, branchId },
			this.schemaAndPolicy,
		);
	}

	private submitMessage(
		message: DecodedMessage<TChange>,
		schemaAndPolicy: ClonableSchemaAndPolicy,
	): void {
		const encodedMessage = this.messageCodec.encode(message, {
			idCompressor: this.idCompressor,
			schema: schemaAndPolicy,
		});
		this.submitLocalMessage(encodedMessage, {
			// Clone the schema to ensure that during resubmit the schema has not been mutated by later changes
			schema: schemaAndPolicy.schema.clone(),
			policy: schemaAndPolicy.policy,
		});
	}

	/**
	 * Process a bunch of messages from the runtime. SharedObject will call this method with a bunch of messages.
	 */
	public processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		const { envelope, local, messagesContent } = messagesCollection;
		const commits: GraphCommit<TChange>[] = [];
		let messagesSessionId: SessionId | undefined;
		let branchId: BranchId | undefined;

		const processBunch = (branch: BranchId): void => {
			assert(messagesSessionId !== undefined, 0xada /* Messages must have a session ID */);
			this.processCommits(
				messagesSessionId,
				brand(envelope.sequenceNumber),
				brand(envelope.referenceSequenceNumber),
				local,
				branch,
				commits,
			);

			commits.length = 0;
			branchId = undefined;
		};

		// Get a list of all the commits from the messages.
		for (const messageContent of messagesContent) {
			// Empty context object is passed in, as our decode function is schema-agnostic.
			const message = this.messageCodec.decode(messageContent.contents, {
				idCompressor: this.idCompressor,
			});

			if (messagesSessionId !== undefined) {
				assert(
					messagesSessionId === message.sessionId,
					0xad9 /* All messages in a bunch must have the same session ID */,
				);
			}
			messagesSessionId = message.sessionId;

			const type = message.type;
			switch (type) {
				case "commit": {
					if (branchId !== undefined && message.branchId !== branchId) {
						processBunch(branchId);
					}

					branchId = message.branchId;
					commits.push(message.commit);
					break;
				}
				case "branch": {
					if (branchId !== undefined) {
						processBunch(branchId);
					}
					this.editManager.sequenceBranchCreation(
						messagesSessionId,
						brand(envelope.referenceSequenceNumber),
						message.branchId,
					);

					this.registerSharedBranch(message.branchId);
					break;
				}
				default:
					unreachableCase(type);
			}
		}

		if (branchId !== undefined) {
			processBunch(branchId);
		}

		this.editManager.advanceMinimumSequenceNumber(brand(envelope.minimumSequenceNumber));
	}

	private processCommits(
		sessionId: SessionId,
		sequenceNumber: SeqNumber,
		referenceSequenceNumber: SeqNumber,
		isLocal: boolean,
		branchId: BranchId,
		commits: readonly GraphCommit<TChange>[],
	): void {
		this.editManager.addSequencedChanges(
			commits,
			sessionId,
			sequenceNumber,
			referenceSequenceNumber,
			branchId,
		);

		// Update the resubmit machine for each commit applied.
		for (const _ of commits) {
			this.tryGetResubmitMachine(branchId)?.onSequencedCommitApplied(isLocal);
		}
	}

	public getLocalBranch(): SharedTreeBranch<TEditor, TChange> {
		return this.editManager.getLocalBranch("main");
	}

	public createSharedBranch(): string {
		const branchId = this.idCompressor.generateCompressedId();
		this.addBranch(branchId);
		this.submitBranchCreation(branchId);
		return this.idCompressor.decompress(branchId);
	}

	protected addBranch(branchId: BranchId): void {
		this.editManager.addBranch(branchId);
		this.registerSharedBranch(branchId);
	}

	public getSharedBranch(branchId: BranchId): SharedTreeBranch<TEditor, TChange> {
		return this.editManager.getLocalBranch(branchId);
	}

	public didAttach(): void {
		this.detachedRevision = undefined;
	}

	public reSubmitCore(content: JsonCompatibleReadOnly, localOpMetadata: unknown): void {
		// Empty context object is passed in, as our decode function is schema-agnostic.
		const message = this.messageCodec.decode(this.serializer.decode(content), {
			idCompressor: this.idCompressor,
		});

		const type = message.type;
		switch (type) {
			case "commit": {
				const {
					commit: { revision },
					branchId,
				} = message;

				const resubmitMachine = this.getResubmitMachine(branchId);
				// If a resubmit phase is not already in progress, then this must be the first commit of a new resubmit phase.
				if (resubmitMachine.isInResubmitPhase === false) {
					const localCommits = this.editManager.getLocalCommits(branchId);
					const revisionIndex = localCommits.findIndex((c) => c.revision === revision);
					assert(revisionIndex >= 0, 0xbdb /* revision must exist in local commits */);
					const toResubmit = localCommits.slice(revisionIndex);
					resubmitMachine.prepareForResubmit(toResubmit);
				}
				assert(
					isClonableSchemaPolicy(localOpMetadata),
					0x95e /* Local metadata must contain schema and policy. */,
				);
				assert(
					resubmitMachine.isInResubmitPhase !== false,
					0x984 /* Invalid resubmit outside of resubmit phase */,
				);
				const enrichedCommit = resubmitMachine.peekNextCommit();
				this.submitCommit(branchId, enrichedCommit, localOpMetadata, true);
				break;
			}
			case "branch": {
				this.submitBranchCreation(message.branchId);
				break;
			}
			default:
				unreachableCase(type);
		}
	}

	public rollback(content: JsonCompatibleReadOnly, localOpMetadata: unknown): void {
		// Empty context object is passed in, as our decode function is schema-agnostic.
		const message = this.messageCodec.decode(this.serializer.decode(content), {
			idCompressor: this.idCompressor,
		});

		const type = message.type;
		switch (type) {
			case "commit": {
				const {
					commit: { revision },
					branchId,
				} = message;
				const branch = this.editManager.getLocalBranch(branchId);
				const head = branch.getHead();
				assert(head.revision === revision, "Can only rollback latest commit");
				const newHead = head.parent ?? fail("must have parent");
				branch.removeAfter(newHead);
				this.getResubmitMachine(branchId).onCommitRollback(head);
				break;
			}
			case "branch": {
				this.editManager.removeBranch(message.branchId);
				break;
			}
			default:
				unreachableCase(type);
		}
	}

	public applyStashedOp(content: JsonCompatibleReadOnly): void {
		// Empty context object is passed in, as our decode function is schema-agnostic.
		const message = this.messageCodec.decode(this.serializer.decode(content), {
			idCompressor: this.idCompressor,
		});

		const type = message.type;
		switch (type) {
			case "commit": {
				const {
					commit: { revision, change },
					branchId,
				} = message;
				this.editManager.getLocalBranch(branchId).apply({ change, revision });
				break;
			}
			case "branch": {
				this.editManager.addBranch(message.branchId);
				break;
			}
			default:
				unreachableCase(type);
		}
	}

	protected registerSharedBranchForEditing(
		branchId: BranchId,
		enricher: ChangeEnricherReadonlyCheckout<TChange>,
		resubmitMachine?: ResubmitMachine<TChange>,
	): void {
		const changeEnricher = enricher ?? new NoOpChangeEnricher();
		const commitEnricher = new BranchCommitEnricher(this.changeFamily.rebaser, changeEnricher);
		assert(!this.enrichers.has(branchId), "Branch already registered");
		this.enrichers.set(branchId, {
			enricher: commitEnricher,
			resubmitMachine:
				resubmitMachine ??
				new DefaultResubmitMachine(
					(change: TaggedChange<TChange>) =>
						this.changeFamily.rebaser.invert(change, true, this.mintRevisionTag()),
					changeEnricher,
				),
		});
	}

	private getResubmitMachine(branchId: BranchId): ResubmitMachine<TChange> {
		return this.getEnricherState(branchId).resubmitMachine;
	}

	private tryGetResubmitMachine(branchId: BranchId): ResubmitMachine<TChange> | undefined {
		return this.tryGetEnricherState(branchId)?.resubmitMachine;
	}

	public getCommitEnricher(branchId: BranchId): BranchCommitEnricher<TChange> {
		return this.getEnricherState(branchId).enricher;
	}

	private getEnricherState(branchId: BranchId): EnricherState<TChange> {
		return (
			this.tryGetEnricherState(branchId) ??
			fail("Expected to have a resubmit machine for this branch")
		);
	}

	private tryGetEnricherState(branchId: BranchId): EnricherState<TChange> | undefined {
		return this.enrichers.get(branchId);
	}
}

interface EnricherState<TChange> {
	readonly enricher: BranchCommitEnricher<TChange>;
	readonly resubmitMachine: ResubmitMachine<TChange>;
}

function isClonableSchemaPolicy(
	maybeSchemaPolicy: unknown,
): maybeSchemaPolicy is ClonableSchemaAndPolicy {
	const schemaAndPolicy = maybeSchemaPolicy as ClonableSchemaAndPolicy;
	return schemaAndPolicy.schema !== undefined && schemaAndPolicy.policy !== undefined;
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
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 * @param stringify - Serializes the contents of the component (including {@link (IFluidHandle:interface)}s) for storage.
	 * @param fullTree - A flag indicating whether the attempt should generate a full
	 * summary tree without any handles for unchanged subtrees. It should only be set to true when generating
	 * a summary from the entire container. The default value is false.
	 * @param trackState - An optimization for tracking state of objects across summaries. If the state
	 * of an object did not change since last successful summary, an
	 * {@link @fluidframework/protocol-definitions#ISummaryHandle} can be used
	 * instead of re-summarizing it. If this is `false`, the expectation is that you should never
	 * send an `ISummaryHandle`, since you are not expected to track state. The default value is true.
	 * @param telemetryContext - See {@link @fluidframework/runtime-definitions#ITelemetryContext}.
	 * @param incrementalSummaryContext - See {@link @fluidframework/runtime-definitions#IExperimentalIncrementalSummaryContext}.
	 */
	summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats;

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
		getSnapshotTree(): ISnapshotTree | undefined {
			const snapshotTree = service.getSnapshotTree?.();
			if (snapshotTree === undefined) {
				return undefined;
			}
			let scopedTree = snapshotTree;
			for (const element of pathElements) {
				const tree = scopedTree.trees[element];
				assert(
					tree !== undefined,
					0xc20 /* snapshot tree not found for one of tree's summarizables */,
				);
				scopedTree = tree;
			}
			return scopedTree;
		},
	};
}
