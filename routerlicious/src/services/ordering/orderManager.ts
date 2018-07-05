import * as assert from "assert";
import * as dns from "dns";
import * as os from "os";
import * as util from "util";
import {
    ICollection, IDocument, IOrderer, IOrdererManager, IOrdererSocket, IRawOperationMessage,
} from "../../core";
import { TmzRunner } from "../../tmz/runner";
import { IProducer, KafkaOrderer } from "../../utils";
import { debug } from "../debug";
import { ISocketOrderer } from "./interfaces";
import { LocalOrderer } from "./localOrderer";
import { ProxyOrderer } from "./proxyOrderer";
import { IReservationManager } from "./reservationManager";

async function getHostIp(): Promise<string> {
    const hostname = os.hostname();
    const lookup = util.promisify(dns.lookup);
    const info = await lookup(hostname);
    return info.address;
}

// Factory method to either create a local or proxy orderer.
// I should have the order manager just have registered factories for types of ordering
async function getOrderer(
    tenantId: string,
    documentId: string,
    collection: ICollection<IDocument>,
    deltasCollection: ICollection<any>,
    reservationManager: IReservationManager,
    tmzRunner: TmzRunner): Promise<ISocketOrderer> {

    // Get the identifier for the current node
    const hostIp = await getHostIp();

    const reservationKey = `${tenantId}/${documentId}`;
    const expiration = Date.now() + 1000;
    const reservation = await reservationManager.reserve(reservationKey, hostIp, expiration);

    if (reservation.value === hostIp) {
        debug(`Becoming leader for ${tenantId}/${documentId}:${hostIp}`);

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
            tmzRunner,
            reservation,
            reservationManager);
    } else {
        // TOOD - will need to check the time on the lease and then take it
        debug(`${hostIp} Connecting to ${tenantId}/${documentId}:${reservation.value}`);
        // Reservation exists - have the orderer simply establish a WS connection to it and proxy commands
        return new ProxyOrderer(reservation.value, tenantId, documentId);
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
        private reservationManager: IReservationManager,
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
                    this.reservationManager,
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
        assert(message.tenantId === "local");
        const localP = this.localOrderers.get(message.documentId);
        assert(localP);
        localP.then((orderer) => {
            orderer.order(message, message.documentId);
        });
    }
}
