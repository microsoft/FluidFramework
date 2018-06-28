import { ICollection, IDocument, IOrderer, IOrdererManager, IRawOperationMessage, IWebSocket } from "../core";
import * as core from "../core";
import { DeliLambda } from "../deli/lambda";
import { ClientSequenceTimeout } from "../deli/lambdaFactory";
import { IContext } from "../kafka-service/lambdas";
import { ScriptoriumLambda } from "../scriptorium/lambda";
import { TmzLambda } from "../tmz/lambda";
import { TmzRunner } from "../tmz/runner";
import { IMessage, IProducer, KafkaOrderer } from "../utils";

// Want a pure local orderer that can do all kinds of stuff
class LocalContext implements IContext {
    public checkpoint(offset: number) {
        return;
    }

    public error(error: any, restart: boolean) {
        return;
    }
}

class LocalProducer implements IProducer {
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

class LocalTopic implements core.ITopic {
    constructor(private publisher: LocalSocketPublisher) {
    }

    public emit(event: string, ...args: any[]) {
        for (const socket of this.publisher.sockets) {
            socket.emit(event, ...args);
        }
    }
}

class LocalSocketPublisher implements core.IPublisher {
    public sockets = new Array<IWebSocket>();

    public on(event: string, listener: (...args: any[]) => void) {
        return;
    }

    public to(topic: string): core.ITopic {
        // TODO need to be able to distinguish sockets and channels. Or just take in raw socket.io here.
        return new LocalTopic(this);
    }

    public attachSocket(socket: IWebSocket) {
        this.sockets.push(socket);
    }
}

export class LocalOrderer implements IOrderer {
    public static async Load(
        tenantId: string,
        documentId: string,
        collection: ICollection<IDocument>,
        deltasCollection: ICollection<any>,
        tmzRunner: TmzRunner): Promise<LocalOrderer> {

        // Lookup the last sequence number stored
        // TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
        const dbObject = await collection.findOne({ documentId, tenantId });
        if (!dbObject) {
            return Promise.reject(`${tenantId}/${documentId} does not exist - cannot sequence`);
        }

        return new LocalOrderer(
            tenantId,
            documentId,
            collection,
            deltasCollection,
            dbObject,
            tmzRunner);
    }

    private offset = 0;
    private deliLambda: DeliLambda;
    private producer: LocalProducer;
    private socketPublisher: LocalSocketPublisher;

    private constructor(
        tenantId: string,
        documentId: string,
        collection: ICollection<IDocument>,
        deltasCollection: ICollection<any>,
        dbObject: IDocument,
        tmzRunner: TmzRunner) {

        // Scriptorium Lambda
        const scriptoriumContext = new LocalContext();
        this.socketPublisher = new LocalSocketPublisher();
        const scriptoriumLambda = new ScriptoriumLambda(
            this.socketPublisher,
            deltasCollection,
            scriptoriumContext);

        // TMZ lambda
        const tmzContext = new LocalContext();
        const tmzLambda = new TmzLambda(
            tmzContext,
            tmzRunner,
            new Promise<void>((resolve, reject) => { return; }));

        // Routemaster lambda
        // import { RouteMasterLambda } from "../routemaster/lambda";
        // const routeMasterContext = new LocalContext();
        // const routemasterLambda = new RouteMasterLambda(
        //     null /* document */,
        // The producer below gets the trickiest. We need to be able to connect to an existing document - or open a new
        // one - and then be able to send messages to it. But this document may not yet be open. So we need to be able
        // to start processing of it. Also how do we manage pending work and fallback in these situations across all
        // lambdas. Or do they combine up together?
        //     producer /* producer */,
        //     routeMasterContext);

        // Deli Lambda
        this.producer = new LocalProducer(scriptoriumLambda, tmzLambda);
        const deliContext = new LocalContext();
        this.deliLambda = new DeliLambda(
            deliContext,
            tenantId,
            documentId,
            dbObject,
            collection,
            this.producer,
            ClientSequenceTimeout);
    }

    public async order(message: IRawOperationMessage, topic: string): Promise<void> {
        const deliMessage: IMessage = {
            highWaterOffset: this.offset,
            key: message.documentId,
            offset: this.offset,
            partition: 0,
            topic,
            value: JSON.stringify(message),
        };
        this.offset++;

        this.deliLambda.handler(deliMessage);
    }

    public attachSocket(socket: any) {
        this.socketPublisher.attachSocket(socket);
    }
}

export class OrdererManager implements IOrdererManager {
    // TODO instantiate the orderer from a passed in config/tenant manager rather than assuming just one
    private orderer: IOrderer;
    private localOrderers = new Map<string, Promise<LocalOrderer>>();

    constructor(
        producer: IProducer,
        private documentsCollection: ICollection<IDocument>,
        private deltasCollection: ICollection<any>,
        private tmzRunner: TmzRunner) {

        this.orderer = new KafkaOrderer(producer);
    }

    public getOrderer(
        socket: any,
        tenantId: string,
        documentId: string): Promise<IOrderer> {

        if (tenantId === "local") {
            if (!this.localOrderers.has(documentId)) {
                const ordererP = LocalOrderer.Load(
                    tenantId,
                    documentId,
                    this.documentsCollection,
                    this.deltasCollection,
                    this.tmzRunner);
                this.localOrderers.set(documentId, ordererP);
            }

            return this.localOrderers.get(documentId).then(
                (orderer) => {
                    orderer.attachSocket(socket);
                    return orderer;
                });
        } else {
            return Promise.resolve(this.orderer);
        }
    }
}
