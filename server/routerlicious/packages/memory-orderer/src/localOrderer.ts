/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { merge } from "lodash";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { IClient } from "@fluidframework/protocol-definitions";
import {
	BroadcasterLambda,
	CheckpointManager,
	createDeliCheckpointManagerFromCollection,
	DeliLambda,
	MoiraLambda,
	ScribeLambda,
	ScriptoriumLambda,
	SummaryReader,
	SummaryWriter,
} from "@fluidframework/server-lambdas";
import { defaultHash, IGitManager } from "@fluidframework/server-services-client";
import {
	DefaultServiceConfiguration,
	IContext,
	IDeliState,
	IDatabaseManager,
	IDocument,
	IDocumentDetails,
	IDocumentStorage,
	IOrderer,
	IOrdererConnection,
	IPublisher,
	IScribe,
	IServiceConfiguration,
	ITopic,
	IWebSocket,
	ILogger,
	IDocumentRepository,
	ICheckpointRepository,
	CheckpointService,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ILocalOrdererSetup } from "./interfaces";
import { LocalContext } from "./localContext";
import { LocalKafka } from "./localKafka";
import { LocalLambdaController } from "./localLambdaController";
import { LocalOrdererConnection } from "./localOrdererConnection";
import { LocalOrdererSetup } from "./localOrdererSetup";
import { IPubSub, ISubscriber, PubSub, WebSocketSubscriber } from "./pubsub";

const DefaultScribe: IScribe = {
	lastClientSummaryHead: undefined,
	logOffset: -1,
	minimumSequenceNumber: -1,
	protocolState: {
		members: [],
		minimumSequenceNumber: 0,
		proposals: [],
		sequenceNumber: 0,
		values: [],
	},
	sequenceNumber: -1,
	lastSummarySequenceNumber: 0,
	validParentSummaries: undefined,
	isCorrupt: false,
	protocolHead: undefined,
	checkpointTimestamp: Date.now(),
};

const DefaultDeli: IDeliState = {
	clients: undefined,
	durableSequenceNumber: 0,
	expHash1: defaultHash,
	logOffset: -1,
	sequenceNumber: 0,
	signalClientConnectionNumber: 0,
	lastSentMSN: 0,
	nackMessages: undefined,
	checkpointTimestamp: undefined,
};

class LocalSocketPublisher implements IPublisher {
	constructor(private readonly publisher: IPubSub) {}

	public on(event: string, listener: (...args: any[]) => void) {
		return;
	}

	public to(topic: string): ITopic {
		return {
			emit: (event: string, ...args: any[]) => this.publisher.publish(topic, event, ...args),
		};
	}

	public async close() {}
}

/**
 * Performs local ordering of messages based on an in-memory stream of operations.
 * @internal
 */
export class LocalOrderer implements IOrderer {
	public static async load(
		storage: IDocumentStorage,
		databaseManager: IDatabaseManager,
		tenantId: string,
		documentId: string,
		logger: ILogger,
		documentRepository: IDocumentRepository,
		deliCheckpointRepository: ICheckpointRepository,
		scribeCheckpointRepository: ICheckpointRepository,
		deliCheckpointService: CheckpointService,
		scribeCheckpointService: CheckpointService,
		gitManager?: IGitManager,
		setup: ILocalOrdererSetup = new LocalOrdererSetup(
			tenantId,
			documentId,
			storage,
			databaseManager,
			documentRepository,
			deliCheckpointRepository,
			scribeCheckpointRepository,
			deliCheckpointService,
			scribeCheckpointService,
			gitManager,
		),
		pubSub: IPubSub = new PubSub(),
		broadcasterContext: IContext = new LocalContext(logger),
		scriptoriumContext: IContext = new LocalContext(logger),
		scribeContext: IContext = new LocalContext(logger),
		deliContext: IContext = new LocalContext(logger),
		moiraContext: IContext = new LocalContext(logger),
		serviceConfiguration: Partial<IServiceConfiguration> = {},
	) {
		const documentDetails = await setup.documentP();

		return new LocalOrderer(
			setup,
			documentDetails,
			tenantId,
			documentId,
			gitManager,
			pubSub,
			broadcasterContext,
			scriptoriumContext,
			scribeContext,
			deliContext,
			moiraContext,
			merge({}, DefaultServiceConfiguration, serviceConfiguration),
		);
	}

	public rawDeltasKafka!: LocalKafka;
	public deltasKafka!: LocalKafka;

	public scriptoriumLambda: LocalLambdaController | undefined;
	public moiraLambda: LocalLambdaController | undefined;
	public scribeLambda: LocalLambdaController | undefined;
	public deliLambda: LocalLambdaController | undefined;
	public broadcasterLambda: LocalLambdaController | undefined;

	private readonly socketPublisher: LocalSocketPublisher;
	private readonly dbObject: IDocument;
	private existing: boolean;

	constructor(
		private readonly setup: ILocalOrdererSetup,
		private readonly details: IDocumentDetails,
		private readonly tenantId: string,
		private readonly documentId: string,
		private readonly gitManager: IGitManager | undefined,
		private readonly pubSub: IPubSub,
		private readonly broadcasterContext: IContext,
		private readonly scriptoriumContext: IContext,
		private readonly scribeContext: IContext,
		private readonly deliContext: IContext,
		private readonly moiraContext: IContext,
		private readonly serviceConfiguration: IServiceConfiguration,
	) {
		this.existing = details.existing;
		this.dbObject = this.getDeliState();
		this.socketPublisher = new LocalSocketPublisher(this.pubSub);

		this.setupKafkas();

		this.setupLambdas();

		this.startLambdas();
	}

	public async connect(
		socket: IWebSocket,
		clientId: string,
		client: IClient,
	): Promise<IOrdererConnection> {
		const socketSubscriber = new WebSocketSubscriber(socket);
		const orderer = this.connectInternal(socketSubscriber, clientId, client);
		return orderer;
	}

	public connectInternal(
		subscriber: ISubscriber,
		clientId: string,
		client: IClient,
	): IOrdererConnection {
		// Create the connection
		const connection = new LocalOrdererConnection(
			subscriber,
			this.existing,
			this.details.value,
			this.rawDeltasKafka,
			this.tenantId,
			this.documentId,
			clientId,
			client,
			this.serviceConfiguration,
		);

		// Document is now existing regardless of the original value
		this.existing = true;

		return connection;
	}

	public async close() {
		await this.closeKafkas();
		this.closeLambdas();
	}

	public hasPendingWork(): boolean {
		if (this.broadcasterLambda?.lambda) {
			return (this.broadcasterLambda.lambda as BroadcasterLambda).hasPendingWork();
		}

		return false;
	}

	private setupKafkas() {
		const deliState: IDeliState = JSON.parse(this.dbObject.deli);
		this.rawDeltasKafka = new LocalKafka(deliState.logOffset + 1);
		this.deltasKafka = new LocalKafka();
	}

	private setupLambdas() {
		this.scriptoriumLambda = new LocalLambdaController(
			this.deltasKafka,
			this.setup,
			this.scriptoriumContext,
			async (lambdaSetup, context) => {
				const deltasCollection = await lambdaSetup.deltaCollectionP();
				return new ScriptoriumLambda(deltasCollection, context, undefined, async () =>
					Promise.resolve(),
				);
			},
		);

		this.broadcasterLambda = new LocalLambdaController(
			this.deltasKafka,
			this.setup,
			this.broadcasterContext,
			async (_, context) =>
				new BroadcasterLambda(
					this.socketPublisher,
					context,
					this.serviceConfiguration,
					undefined,
				),
		);

		if (this.gitManager) {
			this.scribeLambda = new LocalLambdaController(
				this.deltasKafka,
				this.setup,
				this.scribeContext,
				// eslint-disable-next-line @typescript-eslint/promise-function-async
				(lambdaSetup, context) => this.startScribeLambda(lambdaSetup, context),
			);
		}

		this.deliLambda = new LocalLambdaController(
			this.rawDeltasKafka,
			this.setup,
			this.deliContext,
			async (lambdaSetup, context) => {
				const checkpointService = await lambdaSetup.checkpointServiceP("deli");
				const lastCheckpoint = JSON.parse(this.dbObject.deli);
				const checkpointManager = createDeliCheckpointManagerFromCollection(
					this.tenantId,
					this.documentId,
					checkpointService,
				);
				return new DeliLambda(
					context,
					this.tenantId,
					this.documentId,
					lastCheckpoint,
					checkpointManager,
					undefined,
					this.deltasKafka,
					undefined,
					this.rawDeltasKafka,
					this.serviceConfiguration,
					undefined,
					checkpointService,
				);
			},
		);

		if (this.serviceConfiguration.moira.enable) {
			this.moiraLambda = new LocalLambdaController(
				this.deltasKafka,
				this.setup,
				this.moiraContext,
				async (_, context) =>
					new MoiraLambda(
						context,
						this.serviceConfiguration,
						this.tenantId,
						this.documentId,
					),
			);
		}
	}

	private async startScribeLambda(setup: ILocalOrdererSetup, context: IContext) {
		// Scribe lambda
		const [
			documentRepository,
			localCheckpointCollection,
			scribeMessagesCollection,
			protocolHead,
			scribeMessages,
		] = await Promise.all([
			setup.documentRepositoryP(),
			setup.scribeCheckpointRepositoryP(),
			setup.scribeDeltaCollectionP(),
			setup.protocolHeadP(),
			setup.scribeMessagesP(),
		]);

		const scribe = this.getScribeState();
		const lastState = scribe.protocolState
			? scribe.protocolState
			: { members: [], proposals: [], values: [] };

		const protocolHandler = new ProtocolOpHandler(
			scribe.minimumSequenceNumber,
			scribe.sequenceNumber,
			lastState.members,
			lastState.proposals,
			lastState.values,
			() => -1,
		);

		if (!this.gitManager) {
			throw new Error("Git manager is required to start scribe lambda.");
		}

		const summaryReader = new SummaryReader(
			this.tenantId,
			this.documentId,
			this.gitManager,
			false,
			this.details.value.isEphemeralContainer,
		);
		const latestSummary = await summaryReader.readLastSummary();
		const summaryWriter = new SummaryWriter(
			this.tenantId,
			this.documentId,
			this.gitManager,
			undefined /* deltaService */,
			scribeMessagesCollection,
			false /* enableWholeSummaryUpload */,
			latestSummary.messages,
			false /* getDeltasViaAlfred */,
		);

		const checkpointService = new CheckpointService(
			localCheckpointCollection,
			documentRepository,
			false,
		);

		const checkpointManager = new CheckpointManager(
			context,
			this.tenantId,
			this.documentId,
			documentRepository,
			scribeMessagesCollection,
			undefined /* deltaService */,
			false /* getDeltasViaAlfred */,
			false /* verifyLastOpPersistence */,
			checkpointService,
		);

		const maxPendingCheckpointMessagesLength = 2000;

		return new ScribeLambda(
			context,
			this.tenantId,
			this.documentId,
			summaryWriter,
			undefined,
			checkpointManager,
			scribe,
			this.serviceConfiguration,
			this.rawDeltasKafka,
			protocolHandler,
			protocolHead,
			scribeMessages.map((message) => message.operation),
			undefined,
			new Set<string>(),
			true,
			true,
			true,
			this.details.value.isEphemeralContainer ?? false,
			checkpointService.getLocalCheckpointEnabled(),
			maxPendingCheckpointMessagesLength,
		);
	}

	private startLambdas() {
		const lumberjackProperties = {
			...getLumberBaseProperties(this.documentId, this.tenantId),
		};
		if (this.deliLambda) {
			this.deliLambda.start().catch((err) => {
				Lumberjack.error(
					"Error starting memory orderer deli lambda",
					lumberjackProperties,
					err,
				);
			});
		}

		if (this.scriptoriumLambda) {
			this.scriptoriumLambda.start().catch((err) => {
				Lumberjack.error(
					"Error starting memory orderer scriptorium lambda",
					lumberjackProperties,
					err,
				);
			});
		}

		if (this.scribeLambda) {
			this.scribeLambda.start().catch((err) => {
				Lumberjack.error(
					"Error starting memory orderer scribe lambda",
					lumberjackProperties,
					err,
				);
			});
		}

		if (this.broadcasterLambda) {
			this.broadcasterLambda.start().catch((err) => {
				Lumberjack.error(
					"Error starting memory orderer broadcaster lambda",
					lumberjackProperties,
					err,
				);
			});
		}

		if (this.moiraLambda) {
			this.moiraLambda.start().catch((err) => {
				Lumberjack.error(
					"Error starting memory orderer moira lambda",
					lumberjackProperties,
					err,
				);
			});
		}
	}

	private async closeKafkas() {
		await Promise.all([this.rawDeltasKafka.close(), this.deltasKafka.close()]);
	}

	private closeLambdas() {
		if (this.deliLambda) {
			this.deliLambda.close();
			this.deliLambda = undefined;
		}

		if (this.scriptoriumLambda) {
			this.scriptoriumLambda.close();
			this.scriptoriumLambda = undefined;
		}

		if (this.scribeLambda) {
			this.scribeLambda.close();
			this.scribeLambda = undefined;
		}

		if (this.broadcasterLambda) {
			this.broadcasterLambda.close();
			this.broadcasterLambda = undefined;
		}

		if (this.moiraLambda) {
			this.moiraLambda.close();
			this.moiraLambda = undefined;
		}
	}

	private getDeliState(): IDocument {
		const dbObject: IDocument = this.details.value;
		if (dbObject.deli === undefined || dbObject.deli === null) {
			dbObject.deli = JSON.stringify(DefaultDeli);
		}
		return dbObject;
	}

	private getScribeState(): IScribe {
		const dbObject: IDocument = this.details.value;
		const scribe: IScribe =
			dbObject.scribe === undefined || dbObject.scribe === null
				? DefaultScribe
				: typeof this.details.value.scribe === "string"
				? JSON.parse(this.details.value.scribe)
				: this.details.value.scribe;
		return scribe;
	}
}
