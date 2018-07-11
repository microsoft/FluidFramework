import * as assert from "assert";
import { IOrderer, IOrdererManager, IOrdererSocket, IRawOperationMessage } from "../../core";
import { TmzRunner } from "../../tmz/runner";
import { KafkaOrderer, MongoManager } from "../../utils";
import { debug } from "../debug";
import { IConcreteNode, IConcreteNodeFactory, IReservationManager, ISocketOrderer } from "./interfaces";
import { LocalOrderer } from "./localOrderer";
import { ProxyOrderer } from "./proxyOrderer";

export class LocalOrderManager {
    private localOrderers = new Map<string, Promise<ISocketOrderer>>();
    private localNodeP: Promise<IConcreteNode>;

    constructor(
        nodeFactory: IConcreteNodeFactory,
        private mongoManager: MongoManager,
        private documentsCollectionName: string,
        private deltasCollectionName: string,
        private reservationManager: IReservationManager,
        private tmzRunner: TmzRunner) {

        this.localNodeP = nodeFactory.create();
    }

    public async get(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        if (!this.localOrderers.has(documentId)) {
            const ordererP = this.getCore(tenantId, documentId);
            this.localOrderers.set(documentId, ordererP);
        }

        return this.localOrderers.get(documentId);
    }

    public route(message: IRawOperationMessage) {
        assert(message.tenantId === "local");
        const localP = this.localOrderers.get(message.documentId);
        assert(localP);
        localP.then((orderer) => {
            orderer.order(message, message.documentId);
        });
    }

    // Factory method to either create a local or proxy orderer.
    // I should have the order manager just have registered factories for types of ordering
    private async getCore(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        const localNode = await this.localNodeP;

        const reservationKey = `${tenantId}/${documentId}`;
        const reservedNode = await this.reservationManager.getOrReserve(reservationKey, localNode);
        assert(reservedNode.valid);

        if (reservedNode === localNode) {
            // Our node is responsible for sequencing messages
            debug(`Becoming leader for ${tenantId}/${documentId}:${reservedNode.id}`);

            return LocalOrderer.Load(
                this.mongoManager,
                tenantId,
                documentId,
                this.documentsCollectionName,
                this.deltasCollectionName,
                this.tmzRunner);
        } else {
            // TOOD - will need to check the time on the lease and then take it
            debug(`Connecting to ${tenantId}/${documentId}:${reservedNode.id}`);
            // Reservation exists - have the orderer simply establish a WS connection to it and proxy commands
            return new ProxyOrderer(reservedNode, tenantId, documentId);
        }
    }
}

export class OrdererManager implements IOrdererManager {
    constructor(private localOrderManager: LocalOrderManager, private kafkaOrderer: KafkaOrderer) {
    }

    public getOrderer(
        socket: IOrdererSocket,
        tenantId: string,
        documentId: string): Promise<IOrderer> {

        if (tenantId === "local") {
            return this.localOrderManager.get(tenantId, documentId).then(
                (orderer) => {
                    orderer.attachSocket(socket);
                    return orderer;
                });
        } else {
            return Promise.resolve(this.kafkaOrderer);
        }
    }

    public route(message: IRawOperationMessage) {
        this.localOrderManager.route(message);
    }
}
