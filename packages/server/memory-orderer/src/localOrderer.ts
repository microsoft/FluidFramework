/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProtocolOpHandler } from "@microsoft/fluid-container-loader";
import { IClient, IServiceConfiguration } from "@microsoft/fluid-protocol-definitions";
import {
    ActivityCheckingTimeout,
    BroadcasterLambda,
    ClientSequenceTimeout,
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
} from "@microsoft/fluid-server-services-core";
import * as assert from "assert";
import { ILocalOrdererSetup } from "./interfaces";
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
    logOffset: -1,
    minimumSequenceNumber: -1,
    protocolState: undefined,
    sequenceNumber: -1,
};

const DefaultServiceConfiguration: IServiceConfiguration = {
    blockSize: 64436,
    maxMessageSize: 16 * 1024,
    summary: {
        idleTime: 5000,
        maxOps: 1000,
        maxTime: 5000 * 12,
        maxAckWaitTime: 600000,
    },
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
    private topics = new Map<string, Map<string, { subscriber: ISubscriber, count: number }>>();

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
    constructor(private publisher: IPubSub) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        return;
    }

    public to(topic: string): ITopic {
        return {
            emit: (event: string, ...args: any[]) => this.publisher.publish(topic, event, ...args),
        };
    }
}

// Want a pure local orderer that can do all kinds of stuff
class LocalContext implements IContext {
    public checkpoint(offset: number) {
        return;
    }

    public error(error: any, restart: boolean) {
        return;
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
        gitManager?: IGitManager,
        setup: ILocalOrdererSetup = new LocalOrdererSetup(
            tenantId,
            documentId,
            storage,
            databaseManager,
            gitManager),
        pubSub: IPubSub = new PubSub(),
        broadcasterContext: IContext = new LocalContext(),
        scriptoriumContext: IContext = new LocalContext(),
        foremanContext: IContext = new LocalContext(),
        scribeContext: IContext = new LocalContext(),
        deliContext: IContext = new LocalContext(),
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

    private socketPublisher: LocalSocketPublisher;
    private existing: boolean;

    constructor(
        private readonly setup: ILocalOrdererSetup,
        private readonly details: IDocumentDetails,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly taskMessageSender: ITaskMessageSender,
        private readonly tenantManager: ITenantManager,
        private readonly gitManager: IGitManager | undefined,
        private permission: any,
        private maxMessageSize: number,
        private pubSub: IPubSub,
        private broadcasterContext: IContext,
        private scriptoriumContext: IContext,
        private foremanContext: IContext,
        private scribeContext: IContext,
        private deliContext: IContext,
        private clientTimeout: number,
        private serviceConfiguration: IServiceConfiguration,
        private scribeNackOnSummarizeException: boolean,
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

        // document is now existing regardless of the original value
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
        this.rawDeltasKafka = new LocalKafka(this.existing ? this.details.value.sequenceNumber : 0);
        this.deltasKafka = new LocalKafka();
    }

    // tslint:disable-next-line: max-func-body-length
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
                async (lambdaSetup, context) => {
                    // Scribe lambda
                    const [
                        documentCollection,
                        scribeMessagesCollection,
                        protocolHead,
                        scribeMessages,
                    ] = await Promise.all([
                        lambdaSetup.documentCollectionP(),
                        lambdaSetup.scribeDeltaCollectionP(),
                        lambdaSetup.protocolHeadP(),
                        lambdaSetup.scribeMessagesP(),
                    ]);

                    const scribe = this.details.value.scribe
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
                        scribe.tenantId,
                        scribe.documentId,
                        scribe,
                        this.gitManager,
                        this.rawDeltasKafka,
                        protocolHandler,
                        protocolHead,
                        scribeMessages,
                        this.scribeNackOnSummarizeException);
                });
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

    private startLambdas() {
        if (this.deliLambda) {
            this.deliLambda.start();
        }

        if (this.scriptoriumLambda) {
            this.scriptoriumLambda.start();
        }

        if (this.foremanLambda) {
            this.foremanLambda.start();
        }

        if (this.scribeLambda) {
            this.scribeLambda.start();
        }

        if (this.broadcasterLambda) {
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
