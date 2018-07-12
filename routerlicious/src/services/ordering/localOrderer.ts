import { ICollection, IDocument, IOrdererSocket, IRawOperationMessage } from "../../core";
import * as core from "../../core";
import { DeliLambda } from "../../deli/lambda";
import { ClientSequenceTimeout } from "../../deli/lambdaFactory";
import { IContext } from "../../kafka-service/lambdas";
import { ScriptoriumLambda } from "../../scriptorium/lambda";
import { TmzLambda } from "../../tmz/lambda";
import { TmzRunner } from "../../tmz/runner";
import { IMessage, IProducer, MongoManager } from "../../utils";
import { ISocketOrderer } from "./interfaces";

class LocalTopic implements core.ITopic {
    // TODO - this needs to know about outbound web sockets too

    constructor(private topic: string, private publisher: LocalSocketPublisher) {
    }

    public emit(event: string, ...args: any[]) {
        for (const socket of this.publisher.sockets) {
            socket.send(this.topic, event, args[0], args[1]);
        }
    }
}

class LocalSocketPublisher implements core.IPublisher {
    public sockets = new Array<IOrdererSocket>();

    public on(event: string, listener: (...args: any[]) => void) {
        return;
    }

    public to(topic: string): core.ITopic {
        return new LocalTopic(topic, this);
    }

    public attachSocket(socket: IOrdererSocket) {
        this.sockets.push(socket);
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

// Can I treat each Alfred as a mini-Kafka. And consolidate all the deli logic together?
// Rather than creating one per?

/**
 * Performs local ordering of messages based on an in-memory stream of operations.
 */
export class LocalOrderer implements ISocketOrderer {
    public static async Load(
        mongoManager: MongoManager,
        tenantId: string,
        documentId: string,
        documentsCollectionName: string,
        deltasCollectionName: string,
        tmzRunner: TmzRunner) {

        const db = await mongoManager.getDatabase();
        const collection = db.collection<IDocument>(documentsCollectionName);
        const deltasCollection = db.collection<any>(deltasCollectionName);

        // I could put the reservation on the dbObject. And not be able to update the stored numbers unless
        // I fully have the thing
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

    constructor(
        tenantId: string,
        documentId: string,
        collection: ICollection<IDocument>,
        deltasCollection: ICollection<any>,
        dbObject: IDocument,
        tmzRunner: TmzRunner) {

        // TODO I want to maintain an inbound queue. On lambda failures I need to recreate all of them. Just
        // like what happens when the service goes down.

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

    public order(message: IRawOperationMessage): void {
        const deliMessage: IMessage = {
            highWaterOffset: this.offset,
            key: message.documentId,
            offset: this.offset,
            partition: 0,
            topic: message.documentId,
            value: JSON.stringify(message),
        };
        this.offset++;

        this.deliLambda.handler(deliMessage);
    }

    public attachSocket(socket: IOrdererSocket) {
        this.socketPublisher.attachSocket(socket);
    }
}
