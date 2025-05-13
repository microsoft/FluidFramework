/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { inspect } from "util";
import {
	ICheckpointService,
	ICollection,
	IContext,
	IDeltaService,
	IDocument,
	IDocumentRepository,
	IPartitionLambda,
	IPartitionLambdaConfig,
	IPartitionLambdaFactory,
	IProducer,
	IScribe,
	ISequencedOperationMessage,
	IServiceConfiguration,
	ITenantManager,
	MongoManager,
	runWithRetry,
} from "@fluidframework/server-services-core";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IGitManager } from "@fluidframework/server-services-client";
import {
	getLumberBaseProperties,
	LumberEventName,
	Lumberjack,
	Lumber,
} from "@fluidframework/server-services-telemetry";
import { NoOpLambda, createSessionMetric, isDocumentValid, isDocumentSessionValid } from "../utils";
import { CheckpointManager } from "./checkpointManager";
import { ScribeLambda } from "./lambda";
import { SummaryReader } from "./summaryReader";
import { SummaryWriter } from "./summaryWriter";
import { getClientIds, initializeProtocol, isScribeCheckpointQuorumScrubbed } from "./utils";
import { ILatestSummaryState } from "./interfaces";
import { PendingMessageReader } from "./pendingMessageReader";

const DefaultScribe: IScribe = {
	lastClientSummaryHead: undefined,
	logOffset: -1,
	minimumSequenceNumber: 0,
	protocolState: {
		members: [],
		minimumSequenceNumber: 0,
		proposals: [],
		sequenceNumber: 0,
		values: [],
	},
	sequenceNumber: 0,
	lastSummarySequenceNumber: 0,
	validParentSummaries: undefined,
	isCorrupt: false,
	protocolHead: undefined,
	checkpointTimestamp: Date.now(),
};

/**
 * @internal
 */
export class ScribeLambdaFactory
	extends EventEmitter
	implements IPartitionLambdaFactory<IPartitionLambdaConfig>
{
	constructor(
		private readonly mongoManager: MongoManager,
		private readonly documentRepository: IDocumentRepository,
		private readonly messageCollection: ICollection<ISequencedOperationMessage>,
		private readonly producer: IProducer,
		private readonly deltaManager: IDeltaService,
		private readonly tenantManager: ITenantManager,
		private readonly serviceConfiguration: IServiceConfiguration,
		private readonly enableWholeSummaryUpload: boolean,
		private readonly getDeltasViaAlfred: boolean,
		private readonly verifyLastOpPersistence: boolean,
		private readonly transientTenants: string[],
		private readonly disableTransientTenantFiltering: boolean,
		private readonly checkpointService: ICheckpointService,
		private readonly restartOnCheckpointFailure: boolean,
		private readonly kafkaCheckpointOnReprocessingOp: boolean,
		private readonly maxLogtailLength: number,
		private readonly maxPendingCheckpointMessagesLength: number,
	) {
		super();
	}

	public async create(
		config: IPartitionLambdaConfig,
		context: IContext,
	): Promise<IPartitionLambda> {
		let document: IDocument;
		let gitManager: IGitManager;
		let lastCheckpoint: IScribe;
		let summaryReader: SummaryReader;
		let latestSummary: ILatestSummaryState;
		let latestSummaryCheckpoint: IScribe | undefined;
		let latestDbCheckpoint: IScribe | undefined;
		let opMessages: ISequencedDocumentMessage[] = [];

		const { tenantId, documentId } = config;
		const messageMetaData = {
			documentId,
			tenantId,
		};

		let scribeSessionMetric: Lumber<LumberEventName.ScribeSessionResult> | undefined;
		const failCreation = async (error: unknown): Promise<void> => {
			const errorMessage = "Scribe lambda creation failed.";
			context.log?.error(`${errorMessage} Exception: ${inspect(error)}`, { messageMetaData });
			Lumberjack.error(errorMessage, lumberProperties, error);
			scribeSessionMetric?.error("Scribe lambda creation failed", error);
		};

		const lumberProperties = getLumberBaseProperties(documentId, tenantId);

		try {
			document = (await runWithRetry(
				async () => this.documentRepository.readOne({ documentId, tenantId }),
				"readIDocumentInScribeLambdaFactory",
				3 /* maxRetries */,
				1000 /* retryAfterMs */,
				lumberProperties,
				undefined /* shouldIgnoreError */,
				(error) => true /* shouldRetry */,
			)) as IDocument;

			if (!isDocumentValid(document)) {
				// Document sessions can be joined (via Alfred) after a document is functionally deleted.
				// If the document doesn't exist or is marked for deletion then we trivially accept every message.
				const errorMessage = `Received attempt to connect to a missing/deleted document.`;
				context.log?.error(errorMessage, { messageMetaData });
				Lumberjack.error(errorMessage, lumberProperties);
				return new NoOpLambda(context);
			}
			if (document.scribe && JSON.parse(document.scribe)?.isCorrupt) {
				Lumberjack.info(
					`Received attempt to connect to a corrupted document.`,
					lumberProperties,
				);
				return new NoOpLambda(context);
			}
			if (!isDocumentSessionValid(document, this.serviceConfiguration)) {
				// Session for this document is either nonexistent or exists in a different location.
				const errMsg = `Received attempt to connect to invalid session: ${JSON.stringify(
					document.session,
				)}`;
				context.log?.error(errMsg, { messageMetaData });
				Lumberjack.error(errMsg, lumberProperties);
				if (this.serviceConfiguration.enforceDiscoveryFlow) {
					// This can/will prevent any users from creating a valid session in this location
					// for the liftime of this NoOpLambda. This is not ideal; however, throwing an error
					// to prevent lambda creation would mark the document as corrupted, which is worse.
					return new NoOpLambda(context);
				}
			}

			const isEphemeralContainer = document?.isEphemeralContainer;

			scribeSessionMetric = createSessionMetric(
				tenantId,
				documentId,
				LumberEventName.ScribeSessionResult,
				this.serviceConfiguration,
				isEphemeralContainer,
			);

			gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);
			summaryReader = new SummaryReader(
				tenantId,
				documentId,
				gitManager,
				this.enableWholeSummaryUpload,
				isEphemeralContainer,
			);
			latestSummary = await summaryReader.readLastSummary();
			latestSummaryCheckpoint = latestSummary.scribe
				? JSON.parse(latestSummary.scribe)
				: undefined;
			latestDbCheckpoint = (await this.checkpointService.restoreFromCheckpoint(
				documentId,
				tenantId,
				"scribe",
				document,
			)) as IScribe;
		} catch (error) {
			await failCreation(error);
			throw error;
		}

		// For a new document, Summary, Global (document) DB and Local DB checkpoints will not exist.
		// However, it is possible that the global checkpoint was cleared to an empty string
		// due to a service summary, so specifically check if global is not defined at all.
		// Lastly, a new document will also not have a summary checkpoint, so if one exists without a DB checkpoint,
		// we should use the summary checkpoint because there was likely a DB failure.
		const useDefaultCheckpointForNewDocument =
			// Mongodb casts undefined as null so we are checking both to be safe.
			(document.scribe === undefined || document.scribe === null) &&
			!latestDbCheckpoint &&
			!latestSummaryCheckpoint;
		// Empty string for document DB checkpoint denotes a cache that was cleared due to a service summary.
		// This will only happen if IServiceConfiguration.scribe.clearCacheAfterServiceSummary is true. Defaults to false.
		const documentCheckpointIsCleared = document.scribe === "";
		// It's possible that a local checkpoint is written after global checkpoint was cleared for service summary.
		// Similarly, it's possible that the summary checkpoint is ahead of the latest db checkpoint due to a failure.
		const summaryCheckpointAheadOfLatestDbCheckpoint =
			latestSummaryCheckpoint &&
			latestSummaryCheckpoint.sequenceNumber > latestDbCheckpoint?.sequenceNumber;
		// Scrubbed users indicate that the quorum members have been scrubbed for privacy compliance.
		const dbCheckpointQuorumIsScrubbed = isScribeCheckpointQuorumScrubbed(latestDbCheckpoint);
		// Only use the summary checkpoint when
		// 1) summary checkpoint is more recent than any DB checkpoint
		// 2) the document checkpoint is cleared and there is not a more recent local checkpoint
		// 3) the latest db checkpoint quorum members are scrubbed for privacy compliance
		const useLatestSummaryCheckpointForExistingDocument =
			summaryCheckpointAheadOfLatestDbCheckpoint ||
			(documentCheckpointIsCleared && summaryCheckpointAheadOfLatestDbCheckpoint) ||
			dbCheckpointQuorumIsScrubbed;

		if (useDefaultCheckpointForNewDocument) {
			// Restore scribe state if not present in the cache.
			const message = "New document. Setting empty scribe checkpoint";
			context.log?.info(message, { messageMetaData });
			Lumberjack.info(message, lumberProperties);
			lastCheckpoint = DefaultScribe;
		} else if (useLatestSummaryCheckpointForExistingDocument) {
			const message = `Existing document${
				dbCheckpointQuorumIsScrubbed ? " with invalid quorum members" : ""
			}. Fetching checkpoint from summary`;
			context.log?.info(message, { messageMetaData });
			Lumberjack.info(message, lumberProperties);
			if (latestSummary.fromSummary) {
				if (!latestSummaryCheckpoint) {
					const error = new Error(
						"Attempted to load from non-existent summary checkpoint.",
					);
					await failCreation(error);
					throw error;
				}
				if (isScribeCheckpointQuorumScrubbed(latestSummaryCheckpoint)) {
					Lumberjack.error(
						"Quorum from summary is scrubbed. Continuing.",
						lumberProperties,
					);
				}
				lastCheckpoint = latestSummaryCheckpoint;
				opMessages = latestSummary.messages;
				// Since the document was originated elsewhere or cache was cleared, logOffset info is irrelavant.
				// Currently the lambda checkpoints only after updating the logOffset so setting this to lower
				// is okay. Conceptually this is similar to default checkpoint where logOffset is -1. In this case,
				// the sequence number is 'n' rather than '0'.
				lastCheckpoint.logOffset = -1;
				const checkpointMessage = `Restoring checkpoint from latest summary. Seq number: ${lastCheckpoint.sequenceNumber}`;
				context.log?.info(checkpointMessage, { messageMetaData });
				Lumberjack.info(checkpointMessage, lumberProperties);
			} else {
				context.log?.error(`Summary can't be fetched`, { messageMetaData });
				Lumberjack.error(`Summary can't be fetched`, lumberProperties);
				lastCheckpoint = DefaultScribe;
			}
		} else {
			if (!latestDbCheckpoint) {
				const error = new Error("Attempted to load from non-existent DB checkpoint.");
				await failCreation(error);
				throw error;
			}
			lastCheckpoint = latestDbCheckpoint;

			try {
				opMessages = await this.getOpMessages(documentId, tenantId, lastCheckpoint);
			} catch (error) {
				Lumberjack.error(
					`Error getting pending messages after last checkpoint.`,
					lumberProperties,
					error,
				);
			}
		}

		if (lastCheckpoint.isCorrupt) {
			Lumberjack.info(`Attempt to connect to a corrupted document.`, lumberProperties);
			return new NoOpLambda(context);
		}

		// Filter and keep ops after protocol state
		const opsSinceLastSummary = opMessages.filter(
			(message) => message.sequenceNumber > lastCheckpoint.protocolState.sequenceNumber,
		);

		let expectedSequenceNumber = lastCheckpoint.protocolState.sequenceNumber + 1;
		for (const message of opsSinceLastSummary) {
			if (message.sequenceNumber !== expectedSequenceNumber) {
				const error = new Error(
					`Invalid message sequence from checkpoint/summary.` +
						`Current message @${message.sequenceNumber}.` +
						`Expected message @${expectedSequenceNumber}`,
				);
				scribeSessionMetric?.error(
					"Invalid message sequence from checkpoint/summary",
					error,
				);

				throw error;
			}
			++expectedSequenceNumber;
		}

		const protocolHandler = initializeProtocol(lastCheckpoint.protocolState);

		const lastSummaryMessages = latestSummary.messages;
		const summaryWriter = new SummaryWriter(
			tenantId,
			documentId,
			gitManager,
			this.deltaManager,
			this.messageCollection,
			this.enableWholeSummaryUpload,
			lastSummaryMessages,
			this.getDeltasViaAlfred,
			this.maxLogtailLength,
		);
		const checkpointManager = new CheckpointManager(
			context,
			tenantId,
			documentId,
			this.documentRepository,
			this.messageCollection,
			this.deltaManager,
			this.getDeltasViaAlfred,
			this.verifyLastOpPersistence,
			this.checkpointService,
		);

		const pendingMessageReader = new PendingMessageReader(
			tenantId,
			documentId,
			this.deltaManager,
		);

		const scribeLambdaProperties = {
			...getLumberBaseProperties(documentId, tenantId),
			lastCheckpointSeqNo: lastCheckpoint.sequenceNumber,
			logOffset: lastCheckpoint.logOffset,
			protocolHead: latestSummary.protocolHead,
			numOpsSinceLastSummary: opsSinceLastSummary.length,
			lastCheckpointProtocolSeqNo: lastCheckpoint.protocolState.sequenceNumber,
			clientCount: lastCheckpoint.protocolState.members.length,
			clients: getClientIds(lastCheckpoint.protocolState, 5),
		};
		Lumberjack.info(`Creating scribe lambda`, scribeLambdaProperties);
		const scribeLambda = new ScribeLambda(
			context,
			document.tenantId,
			document.documentId,
			summaryWriter,
			pendingMessageReader,
			checkpointManager,
			lastCheckpoint,
			this.serviceConfiguration,
			this.producer,
			protocolHandler,
			latestSummary.protocolHead,
			opsSinceLastSummary,
			scribeSessionMetric,
			new Set(this.transientTenants),
			this.disableTransientTenantFiltering,
			this.restartOnCheckpointFailure,
			this.kafkaCheckpointOnReprocessingOp,
			document.isEphemeralContainer ?? false,
			this.checkpointService.getLocalCheckpointEnabled(),
			this.maxPendingCheckpointMessagesLength,
		);
		return scribeLambda;
	}

	private async getOpMessages(
		documentId: string,
		tenantId: string,
		lastCheckpoint: IScribe,
	): Promise<ISequencedDocumentMessage[]> {
		let opMessages: ISequencedDocumentMessage[] = [];
		if (!this.getDeltasViaAlfred) {
			// Fetch pending ops from scribeDeltas collection
			const dbMessages = await this.messageCollection.find(
				{ documentId, tenantId },
				{ "operation.sequenceNumber": 1 },
			);
			opMessages = dbMessages.map((dbMessage) => dbMessage.operation);
		} else if (lastCheckpoint.logOffset !== -1) {
			opMessages = await this.deltaManager.getDeltas(
				"",
				tenantId,
				documentId,
				lastCheckpoint.protocolState.sequenceNumber,
				lastCheckpoint.protocolState.sequenceNumber + this.maxLogtailLength + 1,
				"scribe",
			);
		}
		return opMessages;
	}

	public async dispose(): Promise<void> {
		await this.mongoManager.close();
	}
}
