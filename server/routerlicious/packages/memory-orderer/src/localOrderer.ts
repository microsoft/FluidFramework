/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ProtocolOpHandler } from "@microsoft/fluid-protocol-base";
import { IClient, IServiceConfiguration } from "@microsoft/fluid-protocol-definitions";
import {
    ActivityCheckingTimeout,
    BroadcasterLambda,
    ClientSequenceTimeout,
    DefaultServiceConfiguration,
    DeliLambda,
    ForemanLambda,
    NoopConsolidationTimeout,
    ScribeLambda,
    ScriptoriumLambda,
} from "@microsoft/fluid-server-lambdas";
import { IGitManager } from "@microsoft/fluid-server-services-client";
import {
    IContext,
    IDatabaseManager,
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
} from "@microsoft/fluid-server-services-core";
import { ILocalOrdererSetup } from "./interfaces";
import { LocalContext } from "./localContext";
import { LocalKafka } from "./localKafka";
import { LocalLambdaController } from "./localLambdaController";
import { LocalOrdererConnection } from "./localOrdererConnection";
import { LocalOrdererSetup } from "./localOrdererSetup";

export interface ISubscriber {
    id: string;
    readonly webSocket?: IWebSocket;
    send(topic: string, ...args: any[]): void;
}

const DefaultScribe: IScribe = {
    lastClientSummaryHead: undefined,
    logOffset: -1,
    minimumSequenceNumber: -1,
    protocolState: undefined,
    sequenceNumber: -1,
};

class WebSocketSubscriber implements ISubscriber {
    public get id(): string {
        return this.webSocket.id;
    }

    constructor(public readonly webSocket: IWebSocket) {
    }

    public send(topic: string, ...args: any[]): void {
        this.webSocket.emit(args[0], ...args.slice(1));
    }
}

export interface IPubSub {
    // Registers a subscriber for the given message
    subscribe(topic: string, subscriber: ISubscriber);

    // Removes the subscriber
    unsubscribe(topic: string, subscriber: ISubscriber);

    // Publishes a message to the given topic
    publish(topic: string, ...args: any[]): void;
}

class PubSub implements IPubSub {
    private readonly topics = new Map<string, Map<string, { subscriber: ISubscriber, count: number }>>();

    public publish(topic: string, ...args: any[]): void {
        const subscriptions = this.topics.get(topic);
        if (subscriptions) {
            for (const [, value] of subscriptions) {
                value.subscriber.send(topic, ...args);
            }
        }
    }

    // Subscribes to a topic. The same subscriber can be added multiple times. In this case we maintain a ref count
    // on the total number of times it has been subscribed. But we will only publish to it once.
    public subscribe(topic: string, subscriber: ISubscriber) {
        if (!this.topics.has(topic)) {
            this.topics.set(topic, new Map<string, { subscriber: ISubscriber, count: number }>());
        }

        const subscriptions = this.topics.get(topic);
        if (!subscriptions.has(subscriber.id)) {
            subscriptions.set(subscriber.id, { subscriber, count: 0 });
        }

        subscriptions.get(subscriber.id).count++;
    }

    public unsubscribe(topic: string, subscriber: ISubscriber) {
        assert(this.topics.has(topic));
        const subscriptions = this.topics.get(topic);

        assert(subscriptions.has(subscriber.id));
        const details = subscriptions.get(subscriber.id);
        details.count--;
        if (details.count === 0) {
            subscriptions.delete(subscriber.id);
        }

        if (subscriptions.size === 0) {
            this.topics.delete(topic);
        }
    }
}

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
        clientTimeout: number = ClientSequenceTimeout,
        serviceConfiguration = DefaultServiceConfiguration,
        scribeNackOnSummarizeException = false,
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
            pubSub,
            broadcasterContext,
            scriptoriumContext,
            foremanContext,
            scribeContext,
            deliContext,
            clientTimeout,
            serviceConfiguration,
            scribeNackOnSummarizeException);
    }

    public rawDeltasKafka: LocalKafka;
    public deltasKafka: LocalKafka;

    public scriptoriumLambda: LocalLambdaController | undefined;
    public foremanLambda: LocalLambdaController | undefined;
    public scribeLambda: LocalLambdaController | undefined;
    public deliLambda: LocalLambdaController | undefined;
    public broadcasterLambda: LocalLambdaController | undefined;

    private readonly socketPublisher: LocalSocketPublisher;
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
        private readonly pubSub: IPubSub,
        private readonly broadcasterContext: IContext,
        private readonly scriptoriumContext: IContext,
        private readonly foremanContext: IContext,
        private readonly scribeContext: IContext,
        private readonly deliContext: IContext,
        private readonly clientTimeout: number,
        private readonly serviceConfiguration: IServiceConfiguration,
        private readonly scribeNackOnSummarizeException: boolean,
    ) {
        this.existing = details.existing;
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
            this.pubSub,
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
        this.rawDeltasKafka = new LocalKafka(this.existing ? this.details.value.logOffset : 0);
        this.deltasKafka = new LocalKafka();
    }

    private setupLambdas() {
        this.scriptoriumLambda = new LocalLambdaController(
            this.deltasKafka,
            this.setup,
            this.scriptoriumContext,
            async (lambdaSetup, context) => {
                const deltasCollection = await lambdaSetup.deltaCollectionP();
                return new ScriptoriumLambda(deltasCollection, undefined, context);
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
                return new DeliLambda(
                    context,
                    this.tenantId,
                    this.documentId,
                    this.details.value,
                    documentCollection,
                    this.deltasKafka,
                    this.rawDeltasKafka,
                    this.clientTimeout,
                    ActivityCheckingTimeout,
                    NoopConsolidationTimeout);
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

        const scribe: IScribe = this.details.value.scribe
            ? typeof this.details.value.scribe === "string" ?
                JSON.parse(this.details.value.scribe) :
                this.details.value.scribe
            : DefaultScribe;
        const lastState = scribe.protocolState
            ? scribe.protocolState
            : { members: [], proposals: [], values: [] };

        const protocolHandler = new ProtocolOpHandler(
            this.documentId,
            scribe.minimumSequenceNumber,
            scribe.sequenceNumber,
            lastState.members,
            lastState.proposals,
            lastState.values,
            () => -1,
            () => { return; });

        return new ScribeLambda(
            context,
            documentCollection,
            scribeMessagesCollection,
            this.tenantId,
            this.documentId,
            scribe,
            this.gitManager,
            this.rawDeltasKafka,
            protocolHandler,
            protocolHead,
            scribeMessages,
            this.scribeNackOnSummarizeException);
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
}
