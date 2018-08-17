import * as assert from "assert";
import * as moniker from "moniker";
import now = require("performance-now");
import * as api from "../../api-core";
import { ICollection, IDocument, IOrdererConnection, ITenantManager } from "../../core";
import * as core from "../../core";
import { DeliLambda } from "../../deli/lambda";
import { ActivityCheckingTimeout, ClientSequenceTimeout } from "../../deli/lambdaFactory";
import { IContext } from "../../kafka-service/lambdas";
import { ScriptoriumLambda } from "../../scriptorium/lambda";
import { TmzLambda } from "../../tmz/lambda";
import { IMessage, IProducer, MongoManager } from "../../utils";

export interface ISubscriber {
    id: string;

    send(topic: string, ...args: any[]): void;
}

class WebSocketSubscriber implements ISubscriber {
    public get id(): string {
        return this.socket.id;
    }

    constructor(private socket: core.IWebSocket) {
    }

    public send(topic: string, ...args: any[]): void {
        this.socket.emit(args[0], ...args.slice(1));
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
            subscriptions.set(subscriber.id, { subscriber, count: 0});
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

// I should just merge the interfaces below and combine into one to avoid creating intermediate classes
class LocalTopic implements core.ITopic {
    constructor(private topic: string, private publisher: IPubSub) {
    }

    public emit(event: string, ...args: any[]) {
        this.publisher.publish(this.topic, event, ...args);
    }
}

class LocalSocketPublisher implements core.IPublisher {
    constructor(private publisher: IPubSub) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        return;
    }

    public to(topic: string): core.ITopic {
        return new LocalTopic(topic, this.publisher);
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

class ScriptoriumProducer implements IProducer {
    private offset = 1;

    constructor(
        private lambda: ScriptoriumLambda,
        private tmzLambda: TmzLambda) {
    }

    public async send(message: string, topic: string): Promise<any> {
        const scriptoriumMessage: IMessage = {
            highWaterOffset: this.offset,
            key: topic,
            offset: this.offset,
            partition: 0,
            topic,
            value: message,
        };
        this.offset++;

        this.lambda.handler(scriptoriumMessage);
        this.tmzLambda.handler(scriptoriumMessage);
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }
}

class DeliProducer implements IProducer {
    private offset = 0;

    constructor(private lambda: DeliLambda) {
    }

    public async send(message: string, topic: string): Promise<any> {
        const deliMessage: IMessage = {
            highWaterOffset: this.offset,
            key: topic,
            offset: this.offset,
            partition: 0,
            topic,
            value: message,
        };
        this.offset++;
        this.lambda.handler(deliMessage);
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }
}

class LocalOrdererConnection implements IOrdererConnection {
    public get clientId(): string {
        return this._clientId;
    }

    public get existing(): boolean {
        return this._existing;
    }

    public get parentBranch(): string {
        return this._parentBranch;
    }

    // tslint:disable:variable-name
    private _clientId: string;
    private _existing: boolean;
    private _parentBranch: string;
    // tslint:enable:variable-name

    constructor(
        private pubsub: IPubSub,
        public socket: ISubscriber,
        existing: boolean,
        document: core.IDocument,
        private producer: IProducer,
        private tenantId: string,
        private documentId: string,
        clientId: string,
        private user: api.ITenantUser,
        private client: api.IClient) {

        this._clientId = clientId;
        this._existing = existing;
        this._parentBranch = document.parent ? document.parent.documentId : null;

        // Subscribe to the message channels
        this.pubsub.subscribe(`${this.tenantId}/${this.documentId}`, this.socket);
        this.pubsub.subscribe(`client#${this.clientId}`, this.socket);

        // Send the connect message
        const clientDetail: api.IClientDetail = {
            clientId: this.clientId,
            detail: this.client,
        };

        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: clientDetail,
                referenceSequenceNumber: -1,
                traces: [],
                type: api.ClientJoin,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };

        // Submit on next tick to sequence behind connect response
        this.submitRawOperation(message);
    }

    public order(message: api.IDocumentMessage): void {
        const rawMessage: core.IRawOperationMessage = {
            clientId: this.clientId,
            documentId: this.documentId,
            operation: message,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };

        this.submitRawOperation(rawMessage);
    }

    public disconnect() {
        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: this.clientId,
                referenceSequenceNumber: -1,
                traces: [],
                type: api.ClientLeave,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };
        this.submitRawOperation(message);

        this.pubsub.unsubscribe(`${this.tenantId}/${this.documentId}`, this.socket);
        this.pubsub.unsubscribe(`client#${this.clientId}`, this.socket);
    }

    private submitRawOperation(message: core.IRawOperationMessage) {
        // Add trace
        if (message.operation && message.operation.traces) {
            message.operation.traces.push(
                {
                    action: "start",
                    service: "alfred",
                    timestamp: now(),
                });
        }

        this.producer.send(JSON.stringify(message), this.documentId);
    }
}

/**
 * Performs local ordering of messages based on an in-memory stream of operations.
 */
export class LocalOrderer implements core.IOrderer {
    public static async Load(
        storage: core.IDocumentStorage,
        mongoManager: MongoManager,
        tenantId: string,
        documentId: string,
        documentsCollectionName: string,
        deltasCollectionName: string,
        taskMessageSender: core.ITaskMessageSender,
        tenantManager: ITenantManager,
        permission: any) {

        const [details, db] = await Promise.all([
            storage.getOrCreateDocument(tenantId, documentId),
            mongoManager.getDatabase(),
        ]);
        const deltasCollection = db.collection<any>(deltasCollectionName);
        const collection = db.collection<IDocument>(documentsCollectionName);

        return new LocalOrderer(
            details,
            tenantId,
            documentId,
            collection,
            deltasCollection,
            taskMessageSender,
            tenantManager,
            permission);
    }

    private producer: ScriptoriumProducer;
    private deliProducer: DeliProducer;
    private existing: boolean;
    private socketPublisher: LocalSocketPublisher;
    private pubsub = new PubSub();

    constructor(
        private details: core.IDocumentDetails,
        private tenantId: string,
        private documentId: string,
        collection: ICollection<core.IDocument>,
        deltasCollection: ICollection<any>,
        private taskMessageSender: core.ITaskMessageSender,
        private tenantManager: ITenantManager,
        private permission: any) {

        this.existing = details.existing;
        this.socketPublisher = new LocalSocketPublisher(this.pubsub);

        // TODO I want to maintain an inbound queue. On lambda failures I need to recreate all of them. Just
        // like what happens when the service goes down.

        // Scriptorium Lambda
        const scriptoriumContext = new LocalContext();
        const scriptoriumLambda = new ScriptoriumLambda(
            this.socketPublisher,
            deltasCollection,
            scriptoriumContext);

        // TMZ lambda
        const tmzContext = new LocalContext();
        const tmzLambda = new TmzLambda(
            this.taskMessageSender,
            this.tenantManager,
            this.permission,
            tmzContext);

        // Deli Lambda
        this.producer = new ScriptoriumProducer(scriptoriumLambda, tmzLambda);
        const deliContext = new LocalContext();
        const deliLambda = new DeliLambda(
            deliContext,
            tenantId,
            documentId,
            details.value,
            collection,
            this.producer,
            this.deliProducer,
            ClientSequenceTimeout,
            ActivityCheckingTimeout);
        this.deliProducer = new DeliProducer(deliLambda);
    }

    public async connect(
        socket: core.IWebSocket,
        user: api.ITenantUser,
        client: api.IClient): Promise<IOrdererConnection> {

        const socketSubscriber = new WebSocketSubscriber(socket);
        const orderer = this.connectInternal(socketSubscriber, user, client);
        return orderer;
    }

    public connectInternal(
        subscriber: ISubscriber,
        user: api.ITenantUser,
        client: api.IClient): IOrdererConnection {
        const clientId = moniker.choose();

        // Create the connection
        const connection = new LocalOrdererConnection(
            this.pubsub,
            subscriber,
            this.existing,
            this.details.value,
            this.deliProducer,
            this.tenantId,
            this.documentId,
            clientId,
            user,
            client);

        // document is now existing regardless of the original value
        this.existing = true;

        return connection;
    }
}
