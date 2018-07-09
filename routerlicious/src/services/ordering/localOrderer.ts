import { ICollection, IDocument, IOrdererSocket, IRawOperationMessage } from "../../core";
import * as core from "../../core";
import { DeliLambda } from "../../deli/lambda";
import { ClientSequenceTimeout } from "../../deli/lambdaFactory";
import { IContext } from "../../kafka-service/lambdas";
import { ScriptoriumLambda } from "../../scriptorium/lambda";
import { TmzLambda } from "../../tmz/lambda";
import { IMessage, IProducer } from "../../utils";
import { debug } from "../debug";
import { TenantManager } from "../tenant";
import { ISocketOrderer } from "./interfaces";
import { IReservation, IReservationManager } from "./reservationManager";

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
    private offset = 0;
    private deliLambda: DeliLambda;
    private producer: LocalProducer;
    private socketPublisher: LocalSocketPublisher;

    constructor(
        private tenantId: string,
        private documentId: string,
        collection: ICollection<IDocument>,
        deltasCollection: ICollection<any>,
        dbObject: IDocument,
        private reservation: IReservation,
        private reservationManager: IReservationManager,
        private taskMessageSender: core.IMessageSender,
        private tenantManager: TenantManager,
        private permission: any) {

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
            this.taskMessageSender,
            this.tenantManager,
            this.permission,
            tmzContext);

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

        this.trackReservation();
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

    public attachSocket(socket: IOrdererSocket) {
        this.socketPublisher.attachSocket(socket);
    }

    private trackReservation() {
        const interval = (this.reservation.expiration - Date.now()) / 2;

        setTimeout(
            () => {
                debug(`Updating reservation for ${this.tenantId}/${this.documentId}`);
                const updated = Date.now() + 60000;
                this.reservationManager.update(this.reservation, updated).then(
                    (newReservation) => {
                        this.reservation = newReservation;
                        this.trackReservation();
                    },
                    (error) => {
                        debug(`Failure updating reservation for ${this.tenantId}/${this.documentId}`, error);
                        // TODO unable to update reservation. Stop ordering and shut down.
                    });
            },
            interval);
    }
}
