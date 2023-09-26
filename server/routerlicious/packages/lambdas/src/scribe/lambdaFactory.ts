/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { inspect } from "util";
import {
	ControlMessageType,
	ICheckpointService,
	ICollection,
	IContext,
	IControlMessage,
	IDeltaService,
	IDocument,
	IDocumentRepository,
	ILambdaStartControlMessageContents,
	IPartitionLambda,
	IPartitionLambdaConfig,
	IPartitionLambdaFactory,
	IProducer,
	IScribe,
	ISequencedOperationMessage,
	IServiceConfiguration,
	ITenantManager,
	LambdaName,
	MongoManager,
	runWithRetry,
} from "@fluidframework/server-services-core";
import {
	IDocumentSystemMessage,
	ISequencedDocumentMessage,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { IGitManager } from "@fluidframework/server-services-client";
import {
	getLumberBaseProperties,
	LumberEventName,
	Lumberjack,
	CommonProperties,
} from "@fluidframework/server-services-telemetry";
import { NoOpLambda, createSessionMetric, isDocumentValid, isDocumentSessionValid } from "../utils";
import { CheckpointManager } from "./checkpointManager";
import { ScribeLambda } from "./lambda";
import { SummaryReader } from "./summaryReader";
import { SummaryWriter } from "./summaryWriter";
import { initializeProtocol, sendToDeli } from "./utils";
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
};

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
		let opMessages: ISequencedDocumentMessage[] = [];

		const { tenantId, documentId } = config;
		const messageMetaData = {
			documentId,
			tenantId,
		};

		const scribeSessionMetric = createSessionMetric(
			tenantId,
			documentId,
			LumberEventName.ScribeSessionResult,
			this.serviceConfiguration,
		);

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

			if (JSON.parse(document.scribe)?.isCorrupt) {
				Lumberjack.info(
					`Received attempt to connect to a corrupted document.`,
					lumberProperties,
				);
				return new NoOpLambda(context);
			}

			if (!isDocumentValid(document)) {
				// Document sessions can be joined (via Alfred) after a document is functionally deleted.
				// If the document doesn't exist or is marked for deletion then we trivially accept every message.
				const errorMessage = `Received attempt to connect to a missing/deleted document.`;
				context.log?.error(errorMessage, { messageMetaData });
				Lumberjack.error(errorMessage, lumberProperties);
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

			scribeSessionMetric?.setProperty(
				CommonProperties.isEphemeralContainer,
				document?.isEphemeralContainer ?? false,
			);

			gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);
			summaryReader = new SummaryReader(
				tenantId,
				documentId,
				gitManager,
				this.enableWholeSummaryUpload,
			);
			latestSummary = await summaryReader.readLastSummary();
		} catch (error) {
			const errorMessage = "Scribe lambda creation failed.";
			context.log?.error(`${errorMessage} Exception: ${inspect(error)}`, { messageMetaData });
			Lumberjack.error(errorMessage, lumberProperties, error);
			await this.sendLambdaStartResult(tenantId, documentId, {
				lambdaName: LambdaName.Scribe,
				success: false,
			});
			scribeSessionMetric?.error("Scribe lambda creation failed", error);

			throw error;
		}

		if (document.scribe === undefined || document.scribe === null) {
			// Restore scribe state if not present in the cache. Mongodb casts undefined as null so we are checking
			// both to be safe. Empty sring denotes a cache that was cleared due to a service summary
			const message = "New document. Setting empty scribe checkpoint";
			context.log?.info(message, { messageMetaData });
			Lumberjack.info(message, lumberProperties);
			lastCheckpoint = DefaultScribe;
		} else if (document.scribe === "") {
			const message = "Existing document. Fetching checkpoint from summary";
			context.log?.info(message, { messageMetaData });
			Lumberjack.info(message, lumberProperties);
			if (!latestSummary.fromSummary) {
				context.log?.error(`Summary can't be fetched`, { messageMetaData });
				Lumberjack.error(`Summary can't be fetched`, lumberProperties);
				lastCheckpoint = DefaultScribe;
			} else {
				lastCheckpoint = JSON.parse(latestSummary.scribe);
				opMessages = latestSummary.messages;
				// Since the document was originated elsewhere or cache was cleared, logOffset info is irrelavant.
				// Currently the lambda checkpoints only after updating the logOffset so setting this to lower
				// is okay. Conceptually this is similar to default checkpoint where logOffset is -1. In this case,
				// the sequence number is 'n' rather than '0'.
				lastCheckpoint.logOffset = -1;
				const checkpointMessage = `Restoring checkpoint from latest summary. Seq number: ${lastCheckpoint.sequenceNumber}`;
				context.log?.info(checkpointMessage, { messageMetaData });
				Lumberjack.info(checkpointMessage, lumberProperties);
			}
		} else {
			lastCheckpoint = (await this.checkpointService.restoreFromCheckpoint(
				documentId,
				tenantId,
				"scribe",
				document,
			)) as IScribe;

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
				await this.sendLambdaStartResult(tenantId, documentId, {
					lambdaName: LambdaName.Scribe,
					success: false,
				});

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
			LastCheckpointProtocolSeqNo: lastCheckpoint.protocolState.sequenceNumber,
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
		);

		await this.sendLambdaStartResult(tenantId, documentId, {
			lambdaName: LambdaName.Scribe,
			success: true,
		});
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

	private async sendLambdaStartResult(
		tenantId: string,
		documentId: string,
		contents: ILambdaStartControlMessageContents | undefined,
	) {
		const controlMessage: IControlMessage = {
			type: ControlMessageType.LambdaStartResult,
			contents,
		};

		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents: null,
			data: JSON.stringify(controlMessage),
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type: MessageType.Control,
		};

		return sendToDeli(tenantId, documentId, this.producer, operation);
	}
}
