/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IClient,
    IClientJoin,
    IDocumentAttributes,
    IDocumentMessage,
    IDocumentSystemMessage,
    MessageType,
} from "@prague/container-definitions";
import { ProtocolOpHandler } from "@prague/container-loader";
import {
    ActivityCheckingTimeout,
    BroadcasterLambda,
    ClientSequenceTimeout,
    DeliLambda,
    ForemanLambda,
    NoopConsolidationTimeout,
    ScribeLambda,
    ScriptoriumLambda,
} from "@prague/lambdas";
import {
    BoxcarType,
    IBoxcarMessage,
    ICollection,
    IContext,
    IDatabaseManager,
    IDocument,
    IDocumentDetails,
    IDocumentStorage,
    IKafkaMessage,
    IOrderer,
    IOrdererConnection,
    IProducer,
    IPublisher,
    IRawOperationMessage,
    IScribe,
    ISequencedOperationMessage,
    ITaskMessageSender,
    ITenantManager,
    ITopic,
    IWebSocket,
    RawOperationType,
} from "@prague/services-core";
import * as assert from "assert";
import { EventEmitter } from "events";
import { IGitManager } from "../../services-client/dist";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now");

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

class LocalOrdererConnection implements IOrdererConnection {
    public readonly parentBranch: string;

    constructor(
        private pubsub: IPubSub,
        public socket: ISubscriber,
        public readonly existing: boolean,
        document: IDocument,
        private producer: IProducer,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly clientId: string,
        private client: IClient,
        public readonly maxMessageSize: number) {

        this.parentBranch = document.parent ? document.parent.documentId : null;

        // Subscribe to the message channels
        // Todo: We probably don't need this.
        this.pubsub.subscribe(`${this.tenantId}/${this.documentId}`, this.socket);
        this.pubsub.subscribe(`client#${this.clientId}`, this.socket);

        // Send the connect message
        const clientDetail: IClientJoin = {
            clientId: this.clientId,
            detail: this.client,
        };

        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(clientDetail),
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.ClientJoin,
        };

        const message: IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };

        // Submit on next tick to sequence behind connect response
        this.submitRawOperation(message);
    }

    public order(message: IDocumentMessage): void {
        const rawMessage: IRawOperationMessage = {
            clientId: this.clientId,
            documentId: this.documentId,
            operation: message,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };

        this.submitRawOperation(rawMessage);
    }

    public disconnect() {
        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(this.clientId),
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.ClientLeave,
        };
        const message: IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };
        this.submitRawOperation(message);

        // Todo: We probably don't need this either.
        this.pubsub.unsubscribe(`${this.tenantId}/${this.documentId}`, this.socket);
        this.pubsub.unsubscribe(`client#${this.clientId}`, this.socket);
    }

    private submitRawOperation(message: IRawOperationMessage) {
        // Add trace
        const operation = message.operation as IDocumentMessage;
        if (operation && operation.traces) {
            operation.traces.push(
                {
                    action: "start",
                    service: "alfred",
                    timestamp: now(),
                });
        }

        const boxcar: IBoxcarMessage = {
            contents: [message],
            documentId: this.documentId,
            tenantId: this.tenantId,
            type: BoxcarType,
        };

        // Submits the message.
        this.producer.send(boxcar, this.tenantId, this.documentId);
    }
}

async function fetchLatestSummaryState(gitManager: IGitManager, documentId: string): Promise<number> {
    const existingRef = await gitManager.getRef(documentId);
    if (!existingRef) {
        return -1;
    }

    const content = await gitManager.getContent(existingRef.object.sha, ".protocol/attributes");
    const attributes = JSON.parse(Buffer.from(content.content, content.encoding).toString()) as IDocumentAttributes;

    return attributes.sequenceNumber;
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
        pubSub: IPubSub = new PubSub(),
        broadcasterContext: IContext = new LocalContext(),
        scriptoriumContext: IContext = new LocalContext(),
        foremanContext: IContext = new LocalContext(),
        scribeContext: IContext = new LocalContext(),
        deliContext: IContext = new LocalContext(),
        clientTimeout: number = ClientSequenceTimeout) {

        const [details, documentCollection, deltasCollection, scribeDeltasCollection] = await Promise.all([
            storage.getOrCreateDocument(tenantId, documentId),
            databaseManager.getDocumentCollection(),
            databaseManager.getDeltaCollection(tenantId, documentId),
            databaseManager.getScribeDeltaCollection(tenantId, documentId),
        ]);

        const [protocolHead, messages] = gitManager
            ?
                await Promise.all([
                    fetchLatestSummaryState(gitManager, documentId),
                    scribeDeltasCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1}),
                ])
            : [0, []];

        return new LocalOrderer(
            details,
            tenantId,
            documentId,
            documentCollection,
            deltasCollection,
            scribeDeltasCollection,
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
            protocolHead,
            messages);
    }

    private socketPublisher: LocalSocketPublisher;

    private scriptoriumLambda: ScriptoriumLambda;
    private foremanLambda: ForemanLambda;
    private scribeLambda: ScribeLambda | undefined;
    private deliLambda: DeliLambda;
    private broadcasterLambda: BroadcasterLambda;

    private alfredToDeliKafka: InMemoryKafka;
    private deliToScriptoriumKafka: InMemoryKafka;

    private existing: boolean;

    constructor(
        private details: IDocumentDetails,
        private tenantId: string,
        private documentId: string,
        documentCollection: ICollection<IDocument>,
        deltasCollection: ICollection<any>,
        scribeMessagesCollection: ICollection<ISequencedOperationMessage>,
        private taskMessageSender: ITaskMessageSender,
        private tenantManager: ITenantManager,
        gitManager: IGitManager | undefined,
        private permission: any,
        private maxMessageSize: number,
        private pubSub: IPubSub,
        private broadcasterContext: IContext,
        private scriptoriumContext: IContext,
        private foremanContext: IContext,
        private scribeContext: IContext,
        private deliContext: IContext,
        clientTimeout: number,
        protocolHead: number,
        scribeMessages: ISequencedOperationMessage[],
    ) {
        this.existing = details.existing;
        this.socketPublisher = new LocalSocketPublisher(this.pubSub);

        // TODO I want to maintain an inbound queue. On lambda failures I need to recreate all of them. Just
        // like what happens when the service goes down.

        // In memory kafka.
        this.alfredToDeliKafka = new InMemoryKafka(this.existing ? details.value.sequenceNumber : 0);
        this.deliToScriptoriumKafka = new InMemoryKafka();

        // Scriptorium + Broadcaster Lambda
        this.scriptoriumLambda = new ScriptoriumLambda(deltasCollection, undefined, this.scriptoriumContext);
        this.broadcasterLambda = new BroadcasterLambda(this.socketPublisher, this.broadcasterContext);

        // Foreman lambda
        this.foremanLambda = new ForemanLambda(
            this.taskMessageSender,
            this.tenantManager,
            this.permission,
            this.foremanContext);

        if (gitManager) {
            // Scribe lambda
            const scribe = details.value.scribe ? details.value.scribe : DefaultScribe;
            const lastState = scribe.protocolState
                ? scribe.protocolState
                : { members: [], proposals: [], values: []};
            const protocolHandler = new ProtocolOpHandler(
                documentId,
                scribe.minimumSequenceNumber,
                scribe.sequenceNumber,
                lastState.members,
                lastState.proposals,
                lastState.values,
                () => -1,
                () => { return; });

            this.scribeLambda = new ScribeLambda(
                this.scribeContext,
                documentCollection,
                scribeMessagesCollection,
                details.value,
                gitManager,
                this.alfredToDeliKafka,
                protocolHandler,
                protocolHead,
                scribeMessages);
        }

        // Deli lambda
        this.deliLambda = new DeliLambda(
            this.deliContext,
            tenantId,
            documentId,
            details.value,
            documentCollection,
            this.deliToScriptoriumKafka,
            this.alfredToDeliKafka,
            clientTimeout,
            ActivityCheckingTimeout,
            NoopConsolidationTimeout);

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
            this.alfredToDeliKafka,
            this.tenantId,
            this.documentId,
            clientId,
            client,
            this.maxMessageSize);

        // document is now existing regardless of the original value
        this.existing = true;

        return connection;
    }

    public async close() {
        // close in-memory kafkas
        this.alfredToDeliKafka.close();
        this.deliToScriptoriumKafka.close();

        // close lambdas
        this.broadcasterLambda.close();
        this.scriptoriumLambda.close();
        this.foremanLambda.close();

        if (this.scribeLambda) {
            this.scribeLambda.close();
        }

        this.deliLambda.close();
    }

    public hasPendingWork(): boolean {
        return this.broadcasterLambda.hasPendingWork();
    }
    private startLambdas() {
        this.alfredToDeliKafka.on("message", (message: IKafkaMessage) => {
            this.deliLambda.handler(message);
        });

        this.deliToScriptoriumKafka.on("message", (message: IKafkaMessage) => {
            this.broadcasterLambda.handler(message);
            this.scriptoriumLambda.handler(message);
            this.foremanLambda.handler(message);

            if (this.scribeLambda) {
                this.scribeLambda.handler(message);
            }
        });
    }
}

// Dumb local in memory kafka.
// TODO: Make this real.
class InMemoryKafka extends EventEmitter implements IProducer {
    constructor(private offset = 0) {
        super();
    }

    public async send(message: any, topic: string): Promise<any> {
        const kafkaMessage: IKafkaMessage = {
            highWaterOffset: this.offset,
            key: topic,
            offset: this.offset,
            partition: 0,
            topic,
            value: JSON.stringify(message),
        };

        this.offset++;

        this.emit("message", kafkaMessage);
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }
}
