/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { merge } from "lodash";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { IClient, IServiceConfiguration } from "@fluidframework/protocol-definitions";
import {
    BroadcasterLambda,
    CheckpointManager,
    DefaultServiceConfiguration,
    DeliLambda,
    ForemanLambda,
    ScribeLambda,
    ScriptoriumLambda,
    SummaryReader,
    SummaryWriter,
} from "@fluidframework/server-lambdas";
import { IGitManager } from "@fluidframework/server-services-client";
import {
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
    ITaskMessageSender,
    ITenantManager,
    ITopic,
    IWebSocket,
    ILogger,
    TokenGenerator,
} from "@fluidframework/server-services-core";
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
    protocolState: undefined,
    sequenceNumber: -1,
};

const DefaultDeli: IDeliState = {
    branchMap: undefined,
    clients: undefined,
    durableSequenceNumber: 0,
    epoch: 0,
    logOffset: -1,
    sequenceNumber: 0,
    term: 1,
};

class LocalSocketPublisher implements IPublisher {
    constructor(private readonly publisher: IPubSub) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        return;
    }

    public to(topic: string): ITopic {
        return {
            emit: (event: string, ...args: any[]) => this.publisher.publish(topic, event, ...args),
        };
    }

    public async close() {
    }
}

/**
 * Performs local ordering of messages based on an in-memory stream of operations.
 */
export class LocalOrderer implements IOrderer {
    public static async load(
        storage: IDocumentStorage,
        databaseManager: IDatabaseManager,
        tenantId: string,
        documentId: string,
        taskMessageSender: ITaskMessageSender,
        tenantManager: ITenantManager,
        permission: any,
        maxMessageSize: number,
        tokenGenerator: TokenGenerator,
        logger: ILogger,
        gitManager?: IGitManager,
        setup: ILocalOrdererSetup = new LocalOrdererSetup(
            tenantId,
            documentId,
            storage,
            databaseManager,
            gitManager),
        pubSub: IPubSub = new PubSub(),
        broadcasterContext: IContext = new LocalContext(logger),
        scriptoriumContext: IContext = new LocalContext(logger),
        foremanContext: IContext = new LocalContext(logger),
        scribeContext: IContext = new LocalContext(logger),
        deliContext: IContext = new LocalContext(logger),
        serviceConfiguration: Partial<IServiceConfiguration> = {},
    ) {
        const documentDetails = await setup.documentP();

        return new LocalOrderer(
            setup,
            documentDetails,
            tenantId,
            documentId,
            taskMessageSender,
            tenantManager,
            gitManager,
            permission,
            maxMessageSize,
            tokenGenerator,
            pubSub,
            broadcasterContext,
            scriptoriumContext,
            foremanContext,
            scribeContext,
            deliContext,
            merge({}, DefaultServiceConfiguration, serviceConfiguration));
    }

    public rawDeltasKafka: LocalKafka;
    public deltasKafka: LocalKafka;

    public scriptoriumLambda: LocalLambdaController | undefined;
    public foremanLambda: LocalLambdaController | undefined;
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
        private readonly taskMessageSender: ITaskMessageSender,
        private readonly tenantManager: ITenantManager,
        private readonly gitManager: IGitManager | undefined,
        private readonly permission: any,
        private readonly maxMessageSize: number,
        private readonly foremanTokenGenrator: TokenGenerator,
        private readonly pubSub: IPubSub,
        private readonly broadcasterContext: IContext,
        private readonly scriptoriumContext: IContext,
        private readonly foremanContext: IContext,
        private readonly scribeContext: IContext,
        private readonly deliContext: IContext,
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
        client: IClient): Promise<IOrdererConnection> {
        const socketSubscriber = new WebSocketSubscriber(socket);
        const orderer = this.connectInternal(socketSubscriber, clientId, client);
        return orderer;
    }

    public connectInternal(
        subscriber: ISubscriber,
        clientId: string,
        client: IClient): IOrdererConnection {
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
            this.maxMessageSize,
            this.serviceConfiguration);

        // Document is now existing regardless of the original value
        this.existing = true;

        return connection;
    }

    public async close() {
        await this.closeKafkas();
        this.closeLambdas();
    }

    public hasPendingWork(): boolean {
        if (this.broadcasterLambda && this.broadcasterLambda.lambda) {
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
                return new ScriptoriumLambda(deltasCollection, context);
            });

        this.broadcasterLambda = new LocalLambdaController(
            this.deltasKafka,
            this.setup,
            this.broadcasterContext,
            async (_, context) => new BroadcasterLambda(this.socketPublisher, context));

        this.foremanLambda = new LocalLambdaController(
            this.deltasKafka,
            this.setup,
            this.foremanContext,
            async (_, context) => new ForemanLambda(
                this.taskMessageSender,
                this.tenantManager,
                this.foremanTokenGenrator,
                this.permission,
                context,
                this.tenantId,
                this.documentId));

        if (this.gitManager) {
            this.scribeLambda = new LocalLambdaController(
                this.deltasKafka,
                this.setup,
                this.scribeContext,
                // eslint-disable-next-line @typescript-eslint/promise-function-async
                (lambdaSetup, context) => this.startScribeLambda(lambdaSetup, context));
        }

        this.deliLambda = new LocalLambdaController(
            this.rawDeltasKafka,
            this.setup,
            this.deliContext,
            async (lambdaSetup, context) => {
                const documentCollection = await lambdaSetup.documentCollectionP();
                const lastCheckpoint = JSON.parse(this.dbObject.deli);
                return new DeliLambda(
                    context,
                    this.tenantId,
                    this.documentId,
                    lastCheckpoint,
                    documentCollection,
                    this.deltasKafka,
                    this.rawDeltasKafka,
                    this.serviceConfiguration);
            });
    }

    private async startScribeLambda(setup: ILocalOrdererSetup, context: IContext) {
        // Scribe lambda
        const [
            documentCollection,
            scribeMessagesCollection,
            protocolHead,
            scribeMessages,
        ] = await Promise.all([
            setup.documentCollectionP(),
            setup.scribeDeltaCollectionP(),
            setup.protocolHeadP(),
            setup.scribeMessagesP(),
        ]);

        const scribe = this.getScribeState();
        const lastState = scribe.protocolState
            ? scribe.protocolState
            : { members: [], proposals: [], values: [] };

        const protocolHandler = new ProtocolOpHandler(
            this.documentId,
            scribe.minimumSequenceNumber,
            scribe.sequenceNumber,
            1, // TODO (Change when local orderer also ticks epoch)
            lastState.members,
            lastState.proposals,
            lastState.values,
            () => -1,
            () => { return; });

        const summaryWriter = new SummaryWriter(
            this.tenantId,
            this.documentId,
            this.gitManager,
            scribeMessagesCollection);
        const summaryReader = new SummaryReader(this.documentId, this.gitManager);
        const checkpointManager = new CheckpointManager(
            this.tenantId,
            this.documentId,
            documentCollection,
            scribeMessagesCollection);
        return new ScribeLambda(
            context,
            this.tenantId,
            this.documentId,
            summaryWriter,
            summaryReader,
            checkpointManager,
            scribe,
            this.serviceConfiguration,
            this.rawDeltasKafka,
            protocolHandler,
            1, // TODO (Change when local orderer also ticks epoch)
            protocolHead,
            scribeMessages.map((message) => message.operation));
    }

    private startLambdas() {
        if (this.deliLambda) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.deliLambda.start();
        }

        if (this.scriptoriumLambda) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.scriptoriumLambda.start();
        }

        if (this.foremanLambda) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.foremanLambda.start();
        }

        if (this.scribeLambda) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.scribeLambda.start();
        }

        if (this.broadcasterLambda) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.broadcasterLambda.start();
        }
    }

    private async closeKafkas() {
        await Promise.all([
            this.rawDeltasKafka.close(),
            this.deltasKafka.close(),
        ]);
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

        if (this.foremanLambda) {
            this.foremanLambda.close();
            this.foremanLambda = undefined;
        }

        if (this.scribeLambda) {
            this.scribeLambda.close();
            this.scribeLambda = undefined;
        }

        if (this.broadcasterLambda) {
            this.broadcasterLambda.close();
            this.broadcasterLambda = undefined;
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
        const scribe: IScribe = (dbObject.scribe === undefined || dbObject.scribe === null)
            ? DefaultScribe
            : typeof this.details.value.scribe === "string" ?
                JSON.parse(this.details.value.scribe) :
                this.details.value.scribe;
        return scribe;
    }
}
