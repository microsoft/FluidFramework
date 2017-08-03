import * as assert from "assert";
import * as _ from "lodash";
import * as api from "../api";
import { debug } from "./debug";
import { IDelta } from "./delta";
import { InkExtension } from "./extension";
import { IInkLayer, ISnapshot, Snapshot } from "./snapshot";

export interface IInk extends api.ICollaborativeObject {
    getLayers(): IInkLayer[];

    getLayer(key: string): IInkLayer;

    submitOp(op: IDelta);
}

/**
 * Map snapshot definition
 */
export interface IInkSnapshot {
    sequenceNumber: number;
    snapshot: ISnapshot;
};

const snapshotFileName = "value";

export class InkCollaborativeObject extends api.CollaborativeObject implements IInk {
    public type: string = InkExtension.Type;

    // The last sequence number processed
    private connection: api.IDeltaConnection;
    private deltaManager: api.DeltaManager = null;

    // The current ink snapshot
    private inkSnapshot: Snapshot = new Snapshot();

    // Locally applied operations not yet sent to the server
    private localOps: api.IMessage[] = [];

    // The last sequence number retrieved from the server
    private sequenceNumber = 0;

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    constructor(
        private document: api.Document,
        public id: string,
        private services?: api.IDistributedObjectServices,
        version?: string,
        header?: string) {
        super();

        if (services) {
            const snapshot: IInkSnapshot = header
                ? JSON.parse(header)
                : { sequenceNumber: 0, snapshot: {} };

            this.inkSnapshot = Snapshot.Clone(snapshot.snapshot);
            this.sequenceNumber = snapshot.sequenceNumber;

            this.listenForUpdates();
        }
    }

    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        this.services = this.document.attach(this);
        this.listenForUpdates();

        for (const localOp of this.localOps) {
            this.submit(localOp);
        }

        return this;
    }

    public isLocal(): boolean {
        return !this.connection;
    }

    public snapshot(): Promise<api.IObject[]> {
        const snapshot: IInkSnapshot = {
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.inkSnapshot),
        };

        return Promise.resolve([{ path: snapshotFileName, data: snapshot}]);
    }

    public getLayers(): IInkLayer[] {
        return this.inkSnapshot.layers;
    }

    public getLayer(key: string): IInkLayer {
        return this.inkSnapshot.layers[this.inkSnapshot.layerIndex[key]];
    }

    public submitOp(op: IDelta) {
        this.processLocalOperation(op);
    }

    private listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteMessage(message);
        });
    }

    /**
     * Processes a message by the local client
     */
    private async processLocalOperation(op: IDelta): Promise<void> {
        // Prep the message
        const message: api.IMessage = {
            document: {
                clientSequenceNumber: null,
                referenceSequenceNumber: null,
            },
            object: {
                clientSequenceNumber: this.clientSequenceNumber++,
                referenceSequenceNumber: this.sequenceNumber,
            },
            op,
        };

        // Store the message for when it is ACKed and then submit to the server if connected
        this.localOps.push(message);
        if (this.connection) {
            this.submit(message);
        }

        this.processOperation(op, true);
    }

    /**
     * Handles a message coming from the remote service
     */
    private processRemoteMessage(message: api.IBase) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.object.sequenceNumber);
        this.sequenceNumber = message.object.sequenceNumber;

        if (message.type === api.OperationType) {
            this.processRemoteOperation(message as api.ISequencedMessage);
        }
    }

    /**
     * Processed a remote operation
     */
    private processRemoteOperation(message: api.ISequencedMessage) {
        if (message.clientId === this.document.clientId) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.localOps.length > 0 &&
                this.localOps[0].object.clientSequenceNumber === message.object.clientSequenceNumber) {
                this.localOps.shift();
            } else {
                debug(`Duplicate ack received ${message.object.clientSequenceNumber}`);
            }
        } else {
            // Message has come from someone else - let's go and update now
            this.processOperation(message.op, false);
        }
    }

    private async submit(message: api.IMessage): Promise<void> {
        this.deltaManager.submitOp(message);
    }

    private processOperation(op: IDelta, isLocal: boolean) {
        this.inkSnapshot.apply(op);
        this.events.emit("op", op, isLocal);
    }
}
