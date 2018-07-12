import * as assert from "assert";
import { IConcreteNode, IConcreteNodeFactory, IReservationManager, ISocketOrderer } from "./interfaces";

export class LocalOrderManager {
    private localOrderers = new Map<string, Promise<ISocketOrderer>>();
    private localNodeP: Promise<IConcreteNode>;

    constructor(private nodeFactory: IConcreteNodeFactory, private reservationManager: IReservationManager) {
        this.createLocalNode();
    }

    public async get(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        if (!this.localOrderers.has(documentId)) {
            const ordererP = this.getCore(tenantId, documentId);
            this.localOrderers.set(documentId, ordererP);
        }

        return this.localOrderers.get(documentId);
    }

    // Factory method to either create a local or proxy orderer.
    // I should have the order manager just have registered factories for types of ordering
    private async getCore(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        const localNode = await this.localNodeP;

        const reservationKey = `${tenantId}/${documentId}`;
        const reservedNode = await this.reservationManager.getOrReserve(reservationKey, localNode);
        assert(reservedNode.valid);

        const orderer = await reservedNode.connectOrderer(tenantId, documentId);
        // orderer can never go bad - only the node

        return orderer;
    }

    private createLocalNode() {
        this.localNodeP = this.nodeFactory.create();
        this.localNodeP.then(
            (localNode) => {
                localNode.on("error", (error) => {
                    // handle disconnects, error, etc... and create a new node
                });
            },
            (error) => {
                // Reconnect the node
            });
    }
}
