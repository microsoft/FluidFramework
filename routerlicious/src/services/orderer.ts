import * as assert from "assert";
import * as async from "async";
import * as dns from "dns";
import * as os from "os";
import * as util from "util";
import * as ws from "ws";
import {
    ICollection, IDocument, IOrderer, IOrdererManager, IOrdererSocket, IRawOperationMessage,
} from "../core";
import * as core from "../core";
import { DeliLambda } from "../deli/lambda";
import { ClientSequenceTimeout } from "../deli/lambdaFactory";
import { IContext } from "../kafka-service/lambdas";
import { ScriptoriumLambda } from "../scriptorium/lambda";
import { TmzLambda } from "../tmz/lambda";
import { TmzRunner } from "../tmz/runner";
import { IMessage, IProducer, KafkaOrderer } from "../utils";
import { debug } from "./debug";

async function getHostIp(): Promise<string> {
    const hostname = os.hostname();
    const lookup = util.promisify(dns.lookup);
    const info = await lookup(hostname);
    return info.address;
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

class LocalTopic implements core.ITopic {
    // TODO - this needs to know about outbound web sockets too

    constructor(private publisher: LocalSocketPublisher) {
    }

    public emit(event: string, ...args: any[]) {
        for (const socket of this.publisher.sockets) {
            socket.send(event, args[0], args[1]);
        }
    }
}

class LocalSocketPublisher implements core.IPublisher {
    public sockets = new Array<IOrdererSocket>();

    public on(event: string, listener: (...args: any[]) => void) {
        return;
    }

    public to(topic: string): core.ITopic {
        // TODO need to be able to distinguish sockets and channels. Or just take in raw socket.io here.
        return new LocalTopic(this);
    }

    public attachSocket(socket: IOrdererSocket) {
        this.sockets.push(socket);
    }
}

async function getOrderer(
    tenantId: string,
    documentId: string,
    collection: ICollection<IDocument>,
    deltasCollection: ICollection<any>,
    reservationsCollection: ICollection<{ documentId: string, tenantId: string, server: string }>,
    tmzRunner: TmzRunner): Promise<ISocketOrderer> {

    const hostIp = await getHostIp();
    debug(`Ordering ${hostIp}`);

    // Check to see if someone has locked the document - if not we can go and do it.
    // If we have the lock we go and start ordering.
    // If we don't have the lock then we figure out who does and start sending messages.
    // Could probably just stash the reservation into the stuff stored with the document below
    const val = await reservationsCollection.findOne({ documentId, tenantId });
    if (!val) {
        debug("We got to the document first");
        await reservationsCollection.insertOne({ documentId, server: hostIp, tenantId });

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
    } else {
        // TOOD - will need to check the time on the lease and then take it
        debug(`*****************************************************`);
        debug(`Not the orderer: Connecting to ${JSON.stringify(val)}`);
        // Reservation exists - have the orderer simply establish a WS connection to it and proxy commands
        return new ProxyOrderer(val.server, tenantId, documentId);
    }
}

interface ISocketOrderer extends IOrderer {
    attachSocket(socket: IOrdererSocket);
}

/**
 * Proxies ordering to an external service which does the actual ordering
 */
class ProxyOrderer implements ISocketOrderer {
    private sockets: IOrdererSocket[] = [];
    private queue: async.AsyncQueue<IRawOperationMessage>;

    constructor(server: string, tenantId: string, documentId: string) {
        // connect to service
        debug(`Connecting to ${server}`);
        const socket = new ws(`ws://${server}:4000`);
        socket.on(
            "open",
            () => {
                debug(`Socket opened`);
                socket.send(
                    JSON.stringify({ op: "connect", tenantId, documentId }),
                    (error) => {
                        debug(`Connected`);
                        this.queue.resume();
                    });
            });

        socket.on(
            "error",
            (error) => {
                debug(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
                debug(error);
            });

        socket.on(
            "message",
            (data) => {
                debug(`*****************************************************`);
                debug(`Inbound`);
                const parsedData = JSON.parse(data as string);
                for (const clientSocket of this.sockets) {
                    debug(`${parsedData.op}, ${parsedData.id}, ${parsedData.data}`);
                    clientSocket.send(parsedData.op, parsedData.id, parsedData.data);
                }
            });

        this.queue = async.queue<IRawOperationMessage, any>(
            (value, callback) => {
                debug(`*****************************************************`);
                debug(`Sending ${value.clientId}@${value.operation.clientSequenceNumber}`);
                socket.send(JSON.stringify({ op: "message", data: value }));
                callback();
            },
            1);
        this.queue.pause();
    }

    public async order(message: IRawOperationMessage, topic: string): Promise<void> {
        debug(`ProxyOrderer ${message.clientId}:${message.operation.clientSequenceNumber}`);
        this.queue.push(message);
    }

    public attachSocket(socket: IOrdererSocket) {
        this.sockets.push(socket);
    }
}

/**
 * Performs local ordering of messages based on an in-memory stream of operations.
 */
class LocalOrderer implements ISocketOrderer {
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
        debug(`Ordering ${message.documentId}@${this.offset}`);
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

    public attachSocket(socket: IOrdererSocket) {
        this.socketPublisher.attachSocket(socket);
    }
}

export class OrdererManager implements IOrdererManager {
    // TODO instantiate the orderer from a passed in config/tenant manager rather than assuming just one
    private orderer: IOrderer;
    private localOrderers = new Map<string, Promise<ISocketOrderer>>();

    constructor(
        producer: IProducer,
        private documentsCollection: ICollection<IDocument>,
        private deltasCollection: ICollection<any>,
        private reservationsCollection: ICollection<{ documentId: string, tenantId: string, server: string }>,
        private tmzRunner: TmzRunner) {

        this.orderer = new KafkaOrderer(producer);
    }

    public getOrderer(
        socket: IOrdererSocket,
        tenantId: string,
        documentId: string): Promise<IOrderer> {

        if (tenantId === "local") {
            if (!this.localOrderers.has(documentId)) {
                const ordererP = getOrderer(
                    tenantId,
                    documentId,
                    this.documentsCollection,
                    this.deltasCollection,
                    this.reservationsCollection,
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

    public route(message: IRawOperationMessage) {
        debug("((((((((((((((((((((((((((((((((((((((");
        debug(`*** Routing ${message.tenantId}`);
        assert(message.tenantId === "local");
        debug(`*** Getting orderer for ${message.documentId}`);
        const localP = this.localOrderers.get(message.documentId);
        assert (localP);
        localP.then((orderer) => {
            debug(`*** Found orderer - ordering ${message.documentId}`);
            orderer.order(message, message.documentId);
        });
    }
}
