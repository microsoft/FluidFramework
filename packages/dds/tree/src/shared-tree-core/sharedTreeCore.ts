/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import {
	type IFluidSerializer,
	SharedObject,
} from "@fluidframework/shared-object-base/internal";

import type { ICodecOptions, IJsonCodec } from "../codec/index.js";
import {
	type ChangeFamily,
	type ChangeFamilyEditor,
	type GraphCommit,
	type RevisionTag,
	RevisionTagCodec,
	type SchemaAndPolicy,
	type SchemaPolicy,
	type TreeStoredSchemaRepository,
} from "../core/index.js";
import {
	type JsonCompatibleReadOnly,
	brand,
	Breakable,
	type WithBreakable,
	throwIfBroken,
	breakingClass,
} from "../util/index.js";

import { type SharedTreeBranch, getChangeReplaceType } from "./branch.js";
import { EditManager, minimumPossibleSequenceNumber } from "./editManager.js";
import { makeEditManagerCodec } from "./editManagerCodecs.js";
import type { SeqNumber } from "./editManagerFormat.js";
import { EditManagerSummarizer } from "./editManagerSummarizer.js";
import { type MessageEncodingContext, makeMessageCodec } from "./messageCodecs.js";
import type { DecodedMessage } from "./messageTypes.js";
import { type ChangeEnricherReadonlyCheckout, NoOpChangeEnricher } from "./changeEnricher.js";
import type { ResubmitMachine } from "./resubmitMachine.js";
import { DefaultResubmitMachine } from "./defaultResubmitMachine.js";
import { BranchCommitEnricher } from "./branchCommitEnricher.js";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

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
	extends SharedObject
	implements WithBreakable
{
	public readonly breaker: Breakable = new Breakable("Shared Tree");

	private readonly editManager: EditManager<TEditor, TChange, ChangeFamily<TEditor, TChange>>;
	private readonly summarizables: readonly Summarizable[];
	/**
	 * The sequence number that this instance is at.
	 * This number is artificial in that it is made up by this instance as opposed to being provided by the runtime.
	 * Is `undefined` after (and only after) this instance is attached.
	 */
	private detachedRevision: SeqNumber | undefined = minimumPossibleSequenceNumber;

	/**
	 * Used to edit the state of the tree. Edits will be immediately applied locally to the tree.
	 * If there is no transaction currently ongoing, then the edits will be submitted to Fluid immediately as well.
	 */
	public get editor(): TEditor {
		return this.getLocalBranch().editor;
	}

	/**
	 * Gets the revision at the head of the trunk.
	 */
	protected get trunkHeadRevision(): RevisionTag {
		return this.editManager.getTrunkHead().revision;
	}

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

	private readonly idCompressor: IIdCompressor;

	private readonly resubmitMachine: ResubmitMachine<TChange>;
	protected readonly commitEnricher: BranchCommitEnricher<TChange>;

	protected readonly mintRevisionTag: () => RevisionTag;

	private readonly schemaAndPolicy: ClonableSchemaAndPolicy;

	/**
	 * @param summarizables - Summarizers for all indexes used by this tree
	 * @param changeFamily - The change family
	 * @param editManager - The edit manager
	 * @param id - The id of the shared object
	 * @param runtime - The IFluidDataStoreRuntime which contains the shared object
	 * @param attributes - Attributes of the shared object
	 * @param telemetryContextPrefix - The property prefix for telemetry pertaining to this object. See {@link ITelemetryContext}
	 */
	public constructor(
		summarizables: readonly Summarizable[],
		changeFamily: ChangeFamily<TEditor, TChange>,
		options: ICodecOptions,
		formatOptions: ExplicitCoreCodecVersions,
		// Base class arguments
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		telemetryContextPrefix: string,
		schema: TreeStoredSchemaRepository,
		schemaPolicy: SchemaPolicy,
		resubmitMachine?: ResubmitMachine<TChange>,
		enricher?: ChangeEnricherReadonlyCheckout<TChange>,
	) {
		super(id, runtime, attributes, telemetryContextPrefix);

		this.schemaAndPolicy = {
			schema,
			policy: schemaPolicy,
		};

		const rebaseLogger = createChildLogger({
			logger: this.logger,
			namespace: "Rebase",
		});

		assert(
			runtime.idCompressor !== undefined,
			0x886 /* IdCompressor must be enabled to use SharedTree */,
		);
		this.idCompressor = runtime.idCompressor;
		this.mintRevisionTag = () => this.idCompressor.generateCompressedId();
		/**
		 * A random ID that uniquely identifies this client in the collab session.
		 * This is sent alongside every op to identify which client the op originated from.
		 * This is used rather than the Fluid client ID because the Fluid client ID is not stable across reconnections.
		 */
		const localSessionId = runtime.idCompressor.localSessionId;
		this.editManager = new EditManager(
			changeFamily,
			localSessionId,
			this.mintRevisionTag,
			rebaseLogger,
		);
		this.editManager.localBranch.on("transactionStarted", () => {
			this.commitEnricher.startNewTransaction();
		});
		this.editManager.localBranch.on("transactionAborted", () => {
			this.commitEnricher.abortCurrentTransaction();
		});
		this.editManager.localBranch.on("transactionCommitted", () => {
			this.commitEnricher.commitCurrentTransaction();
		});
		this.editManager.localBranch.on("beforeChange", (change) => {
			// Ensure that any previously prepared commits that have not been sent are purged.
			this.commitEnricher.purgePreparedCommits();
			if (this.detachedRevision !== undefined) {
				// Edits submitted before the first attach do not need enrichment because they will not be applied by peers.
			} else if (change.type === "append") {
				if (this.getLocalBranch().isTransacting()) {
					for (const newCommit of change.newCommits) {
						this.commitEnricher.ingestTransactionCommit(newCommit);
					}
				} else {
					for (const newCommit of change.newCommits) {
						this.commitEnricher.prepareCommit(newCommit, false);
					}
				}
			} else if (
				change.type === "replace" &&
				getChangeReplaceType(change) === "transactionCommit" &&
				!this.getLocalBranch().isTransacting()
			) {
				assert(
					change.newCommits.length === 1,
					0x983 /* Unexpected number of commits when committing transaction */,
				);
				this.commitEnricher.prepareCommit(change.newCommits[0] ?? oob(), true);
			}
		});
		this.editManager.localBranch.on("afterChange", (change) => {
			if (this.getLocalBranch().isTransacting()) {
				// We do not submit ops for changes that are part of a transaction.
				return;
			}
			if (
				change.type === "append" ||
				(change.type === "replace" && getChangeReplaceType(change) === "transactionCommit")
			) {
				if (this.detachedRevision !== undefined) {
					for (const newCommit of change.newCommits) {
						this.submitCommit(newCommit, this.schemaAndPolicy);
					}
				} else {
					for (const newCommit of change.newCommits) {
						const prepared = this.commitEnricher.getPreparedCommit(newCommit);
						this.submitCommit(prepared, this.schemaAndPolicy);
					}
				}
			}
		});

		const revisionTagCodec = new RevisionTagCodec(runtime.idCompressor);
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
			new RevisionTagCodec(runtime.idCompressor),
			options,
			formatOptions.message,
		);

		const changeEnricher = enricher ?? new NoOpChangeEnricher();
		this.resubmitMachine =
			resubmitMachine ??
			new DefaultResubmitMachine(
				changeFamily.rebaser.invert.bind(changeFamily.rebaser),
				changeEnricher,
			);
		this.commitEnricher = new BranchCommitEnricher(changeFamily.rebaser, changeEnricher);
	}

	// TODO: SharedObject's merging of the two summary methods into summarizeCore is not what we want here:
	// We might want to not subclass it, or override/reimplement most of its functionality.
	@throwIfBroken
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
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
					incrementalSummaryContext,
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
	 * @returns the submitted commit. This is undefined if the underlying `SharedObject` is not attached,
	 * and may differ from `commit` due to enrichments like detached tree refreshers.
	 */

	private submitCommit(
		commit: GraphCommit<TChange>,
		schemaAndPolicy: ClonableSchemaAndPolicy,
		isResubmit = false,
	): void {
		assert(
			// Edits should not be submitted until all transactions finish
			!this.getLocalBranch().isTransacting() || isResubmit,
			0x68b /* Unexpected edit submitted during transaction */,
		);
		assert(
			this.isAttached() === (this.detachedRevision === undefined),
			0x95a /* Detached revision should only be set when not attached */,
		);

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
			this.editManager.advanceMinimumSequenceNumber(newRevision);
			return undefined;
		}
		const message = this.messageCodec.encode(
			{
				commit,
				sessionId: this.editManager.localSessionId,
			},
			{
				idCompressor: this.idCompressor,
				schema: schemaAndPolicy,
			},
		);
		this.submitLocalMessage(message, {
			// Clone the schema to ensure that during resubmit the schema has not been mutated by later changes
			schema: schemaAndPolicy.schema.clone(),
			policy: schemaAndPolicy.policy,
		});
		this.resubmitMachine.onCommitSubmitted(commit);
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// Empty context object is passed in, as our decode function is schema-agnostic.
		const { commit, sessionId } = this.messageCodec.decode(message.contents, {
			idCompressor: this.idCompressor,
		});

		this.editManager.addSequencedChange(
			{ ...commit, sessionId },
			brand(message.sequenceNumber),
			brand(message.referenceSequenceNumber),
		);
		this.resubmitMachine.onSequencedCommitApplied(local);

		this.editManager.advanceMinimumSequenceNumber(brand(message.minimumSequenceNumber));
	}

	/**
	 * @returns the head commit of the root local branch
	 */
	protected getLocalBranch(): SharedTreeBranch<TEditor, TChange> {
		return this.editManager.localBranch;
	}

	protected onDisconnect(): void {}

	protected override didAttach(): void {
		if (this.detachedRevision !== undefined) {
			this.detachedRevision = undefined;
		}
	}

	protected override reSubmitCore(
		content: JsonCompatibleReadOnly,
		localOpMetadata: unknown,
	): void {
		// Empty context object is passed in, as our decode function is schema-agnostic.
		const {
			commit: { revision },
		} = this.messageCodec.decode(this.serializer.decode(content), {
			idCompressor: this.idCompressor,
		});
		const [commit] = this.editManager.findLocalCommit(revision);
		// If a resubmit phase is not already in progress, then this must be the first commit of a new resubmit phase.
		if (this.resubmitMachine.isInResubmitPhase === false) {
			const toResubmit = this.editManager.getLocalCommits();
			assert(
				commit === toResubmit[0],
				0x95d /* Resubmit phase should start with the oldest local commit */,
			);
			this.resubmitMachine.prepareForResubmit(toResubmit);
		}
		assert(
			isClonableSchemaPolicy(localOpMetadata),
			0x95e /* Local metadata must contain schema and policy. */,
		);
		assert(
			this.resubmitMachine.isInResubmitPhase !== false,
			0x984 /* Invalid resubmit outside of resubmit phase */,
		);
		const enrichedCommit = this.resubmitMachine.peekNextCommit();
		this.submitCommit(enrichedCommit, localOpMetadata, true);
	}

	protected applyStashedOp(content: JsonCompatibleReadOnly): void {
		assert(
			!this.getLocalBranch().isTransacting(),
			0x674 /* Unexpected transaction is open while applying stashed ops */,
		);
		// Empty context object is passed in, as our decode function is schema-agnostic.
		const {
			commit: { revision, change },
		} = this.messageCodec.decode(content, { idCompressor: this.idCompressor });
		this.editManager.localBranch.apply(change, revision);
	}

	public override getGCData(fullGC?: boolean): IGarbageCollectionData {
		const gcNodes: IGarbageCollectionData["gcNodes"] = super.getGCData(fullGC).gcNodes;
		for (const s of this.summarizables) {
			for (const [id, routes] of Object.entries(s.getGCData(fullGC).gcNodes)) {
				gcNodes[id] ??= [];
				for (const route of routes) {
					// Non null asserting here because we are creating an array at gcNodes[id] if it is undefined
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					gcNodes[id]!.push(route);
				}
			}
		}

		return {
			gcNodes,
		};
	}
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
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getAttachSummary}
	 * @param stringify - Serializes the contents of the component (including {@link (IFluidHandle:interface)}s) for storage.
	 */
	getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 * @param stringify - Serializes the contents of the component (including {@link (IFluidHandle:interface)}s) for storage.
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
