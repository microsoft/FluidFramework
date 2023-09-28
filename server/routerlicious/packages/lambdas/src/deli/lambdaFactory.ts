/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { inspect } from "util";
import { toUtf8 } from "@fluidframework/common-utils";
import {
	ICheckpointService,
	IClientManager,
	IContext,
	IDeliState,
	IDocument,
	IDocumentRepository,
	ILogger,
	IPartitionLambda,
	IPartitionLambdaConfig,
	IPartitionLambdaFactory,
	IProducer,
	IServiceConfiguration,
	ITenantManager,
	LambdaCloseType,
	MongoManager,
	requestWithRetry,
	runWithRetry,
} from "@fluidframework/server-services-core";
import { defaultHash, IGitManager } from "@fluidframework/server-services-client";
import {
	Lumber,
	LumberEventName,
	Lumberjack,
	getLumberBaseProperties,
	CommonProperties,
} from "@fluidframework/server-services-telemetry";
import { NoOpLambda, createSessionMetric, isDocumentValid, isDocumentSessionValid } from "../utils";
import { DeliLambda } from "./lambda";
import { createDeliCheckpointManagerFromCollection } from "./checkpointManager";

const getDefaultCheckpoint = (): IDeliState => {
	return {
		clients: undefined,
		durableSequenceNumber: 0,
		expHash1: defaultHash,
		logOffset: -1,
		sequenceNumber: 0,
		signalClientConnectionNumber: 0,
		lastSentMSN: 0,
		nackMessages: undefined,
		successfullyStartedLambdas: [],
		checkpointTimestamp: Date.now(),
	};
};

export class DeliLambdaFactory
	extends EventEmitter
	implements IPartitionLambdaFactory<IPartitionLambdaConfig>
{
	constructor(
		private readonly operationsDbMongoManager: MongoManager,
		private readonly documentRepository: IDocumentRepository,
		private readonly checkpointService: ICheckpointService,
		private readonly tenantManager: ITenantManager,
		private readonly clientManager: IClientManager | undefined,
		private readonly forwardProducer: IProducer,
		private readonly signalProducer: IProducer | undefined,
		private readonly reverseProducer: IProducer,
		private readonly serviceConfiguration: IServiceConfiguration,
	) {
		super();
	}

	public async create(
		config: IPartitionLambdaConfig,
		context: IContext,
	): Promise<IPartitionLambda> {
		const { documentId, tenantId } = config;
		const sessionMetric = createSessionMetric(
			tenantId,
			documentId,
			LumberEventName.SessionResult,
			this.serviceConfiguration,
		);
		const sessionStartMetric = createSessionMetric(
			tenantId,
			documentId,
			LumberEventName.StartSessionResult,
			this.serviceConfiguration,
		);

		const messageMetaData = {
			documentId,
			tenantId,
		};

		let gitManager: IGitManager;
		let document: IDocument;

		try {
			// Lookup the last sequence number stored
			// TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
			document = await this.documentRepository.readOne({ documentId, tenantId });

			// Check if the document was deleted prior.
			if (!isDocumentValid(document)) {
				// (Old, from tanviraumi:) Temporary guard against failure until we figure out what causing this to trigger.
				// Document sessions can be joined (via Alfred) after a document is functionally deleted.
				const errorMessage = `Received attempt to connect to a missing/deleted document.`;
				context.log?.error(errorMessage, { messageMetaData });
				Lumberjack.error(errorMessage, getLumberBaseProperties(documentId, tenantId));
				return new NoOpLambda(context);
			}

			if (!isDocumentSessionValid(document, this.serviceConfiguration)) {
				// Session for this document is either nonexistent or exists in a different location.
				const errMsg = `Received attempt to connect to invalid session: ${JSON.stringify(
					document.session,
				)}`;
				context.log?.error(errMsg, { messageMetaData });
				Lumberjack.error(errMsg, getLumberBaseProperties(documentId, tenantId));
				if (this.serviceConfiguration.enforceDiscoveryFlow) {
					// This can/will prevent any users from creating a valid session in this location
					// for the liftime of this NoOpLambda. This is not ideal; however, throwing an error
					// to prevent lambda creation would mark the document as corrupted, which is worse.
					return new NoOpLambda(context);
				}
			}

			sessionMetric?.setProperty(
				CommonProperties.isEphemeralContainer,
				document?.isEphemeralContainer ?? false,
			);

			gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);
		} catch (error) {
			const errMsg = "Deli lambda creation failed";
			context.log?.error(`${errMsg}. Exception: ${inspect(error)}`, { messageMetaData });
			Lumberjack.error(errMsg, getLumberBaseProperties(documentId, tenantId), error);
			this.logSessionFailureMetrics(sessionMetric, sessionStartMetric, errMsg);
			throw error;
		}

		let lastCheckpoint;

		// Restore deli state if not present in the cache. Mongodb casts undefined as null so we are checking
		// both to be safe. Empty sring denotes a cache that was cleared due to a service summary or the document
		// was created within a different tenant.
		if (document.deli === undefined || document.deli === null) {
			const message = "New document. Setting empty deli checkpoint";
			context.log?.info(message, { messageMetaData });
			Lumberjack.info(message, getLumberBaseProperties(documentId, tenantId));
			lastCheckpoint = getDefaultCheckpoint();
		} else {
			if (document.deli === "") {
				const docExistsMessge = "Existing document. Fetching checkpoint from summary";
				context.log?.info(docExistsMessge, { messageMetaData });
				Lumberjack.info(docExistsMessge, getLumberBaseProperties(documentId, tenantId));

				const lastCheckpointFromSummary = await this.loadStateFromSummary(
					tenantId,
					documentId,
					gitManager,
					context.log,
				);
				if (lastCheckpointFromSummary === undefined) {
					const errMsg = "Could not load state from summary";
					context.log?.error(errMsg, { messageMetaData });
					Lumberjack.error(errMsg, getLumberBaseProperties(documentId, tenantId));
					this.logSessionFailureMetrics(sessionMetric, sessionStartMetric, errMsg);

					lastCheckpoint = getDefaultCheckpoint();
				} else {
					lastCheckpoint = lastCheckpointFromSummary;
					// Since the document was originated elsewhere or cache was cleared, logOffset info is irrelavant.
					// Currently the lambda checkpoints only after updating the logOffset so setting this to lower
					// is okay. Conceptually this is similar to default checkpoint where logOffset is -1. In this case,
					// the sequence number is 'n' rather than '0'.
					lastCheckpoint.logOffset = -1;
					const message = `Deli checkpoint from summary: ${JSON.stringify(
						lastCheckpoint,
					)}`;
					context.log?.info(message, { messageMetaData });
					Lumberjack.info(message, getLumberBaseProperties(documentId, tenantId));
				}
			} else {
				lastCheckpoint = await this.checkpointService.restoreFromCheckpoint(
					documentId,
					tenantId,
					"deli",
					document,
				);
			}
		}

		// Add checkpointTimestamp as UTC now if checkpoint doesn't have a timestamp yet.
		if (
			lastCheckpoint.checkpointTimestamp === undefined ||
			lastCheckpoint.checkpointTimestamp === null
		) {
			lastCheckpoint.checkpointTimestamp = Date.now();
		}

		const checkpointManager = createDeliCheckpointManagerFromCollection(
			tenantId,
			documentId,
			this.checkpointService,
		);

		const deliLambda = new DeliLambda(
			context,
			tenantId,
			documentId,
			lastCheckpoint,
			checkpointManager,
			this.clientManager,
			// The producer as well it shouldn't take. Maybe it just gives an output stream?
			this.forwardProducer,
			this.signalProducer,
			this.reverseProducer,
			this.serviceConfiguration,
			sessionMetric,
			sessionStartMetric,
			this.checkpointService,
		);

		deliLambda.on("close", (closeType) => {
			const handler = async () => {
				if (
					closeType === LambdaCloseType.ActivityTimeout ||
					closeType === LambdaCloseType.Error
				) {
					if (document?.isEphemeralContainer) {
						// Call to historian to delete summaries
						await requestWithRetry(
							async () => gitManager.deleteSummary(false),
							"deliLambda_onClose" /* callName */,
							getLumberBaseProperties(documentId, tenantId) /* telemetryProperties */,
							(error) => true /* shouldRetry */,
							3 /* maxRetries */,
						);

						// Delete the document metadata
						await runWithRetry(
							async () =>
								this.documentRepository.deleteOne({
									documentId,
									tenantId,
								}),
							"deleteDocMetadata",
							3 /* maxRetries */,
							1000 /* retryAfterMs */,
							getLumberBaseProperties(documentId, tenantId),
							(error) => error.code === 11000 /* shouldIgnoreError */,
							(error) => true /* shouldRetry */,
						);

						Lumberjack.info(
							`Successfully cleaned up ephemeral container`,
							getLumberBaseProperties(documentId, tenantId),
						);

						return;
					}
					const filter = { documentId, tenantId, session: { $exists: true } };
					const data = {
						"session.isSessionAlive": false,
						"session.isSessionActive": false,
						"lastAccessTime": Date.now(),
					};
					await this.documentRepository.updateOne(filter, data, undefined);
					const message = `Marked session alive and active as false for closeType:
                        ${JSON.stringify(closeType)}`;

					context.log?.info(message, { messageMetaData });
					Lumberjack.info(message, getLumberBaseProperties(documentId, tenantId));
				}
			};
			handler().catch((e) => {
				const message = `Failed to handle session alive and active with exception ${e}`;
				context.log?.error(message, { messageMetaData });
				Lumberjack.error(message, getLumberBaseProperties(documentId, tenantId), e);
			});
		});

		// Fire-and-forget sessionAlive and sessionActive update for session-boot performance.
		// Worst case is that document is allowed to be deleted while active.
		context.log?.info(`Deli Lambda is marking session as alive and active as true.`, {
			messageMetaData,
		});
		this.documentRepository
			.updateOne(
				{ tenantId, documentId },
				{
					"session.isSessionAlive": true,
					"session.isSessionActive": true,
				},
			)
			.catch((error) => {
				const errMsg = "Deli Lambda failed to mark session as active.";
				context.log?.error(`${errMsg} Exception: ${inspect(error)}`, { messageMetaData });
				Lumberjack.error(`${errMsg}`, getLumberBaseProperties(documentId, tenantId), error);
			});

		return deliLambda;
	}

	private logSessionFailureMetrics(
		sessionMetric: Lumber<LumberEventName.SessionResult> | undefined,
		sessionStartMetric: Lumber<LumberEventName.StartSessionResult> | undefined,
		errMsg: string,
	) {
		sessionMetric?.error(errMsg);
		sessionStartMetric?.error(errMsg);
	}

	public async dispose(): Promise<void> {
		const mongoClosedP = this.operationsDbMongoManager.close();
		const forwardProducerClosedP = this.forwardProducer.close();
		const signalProducerClosedP = this.signalProducer?.close();
		const reverseProducerClosedP = this.reverseProducer.close();
		await Promise.all([
			mongoClosedP,
			forwardProducerClosedP,
			signalProducerClosedP,
			reverseProducerClosedP,
		]);
	}

	// Fetches last durable deli state from summary. Returns undefined if not present.
	private async loadStateFromSummary(
		tenantId: string,
		documentId: string,
		gitManager: IGitManager,
		logger: ILogger | undefined,
	): Promise<IDeliState | undefined> {
		const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
		if (existingRef) {
			try {
				const content = await gitManager.getContent(
					existingRef.object.sha,
					".serviceProtocol/deli",
				);
				const summaryCheckpoint = JSON.parse(
					toUtf8(content.content, content.encoding),
				) as IDeliState;
				return summaryCheckpoint;
			} catch (exception) {
				const messageMetaData = {
					documentId,
					tenantId,
				};
				const errorMessage = `Error fetching deli state from summary`;
				logger?.error(errorMessage, { messageMetaData });
				logger?.error(JSON.stringify(exception), { messageMetaData });
				Lumberjack.error(
					errorMessage,
					getLumberBaseProperties(documentId, tenantId),
					exception,
				);
				return undefined;
			}
		}
	}
}
