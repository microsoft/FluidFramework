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

    constructor(public id: string, private services?: api.ICollaborationServices) {
        super();

        if (services) {
            this.load(id, services);
        }
    }

    public async attach(services: api.ICollaborationServices, registry: api.Registry): Promise<void> {
        this.services = services;

        // Attaching makes a local document available for collaboration. The connect call should create the object.
        // We assert the return type to validate this is the case.
        this.connection = await services.deltaNotificationService.connect(this.id, this.type);
        this.listenForUpdates();

        for (const localOp of this.localOps) {
            this.submit(localOp);
        }
    }

    public isLocal(): boolean {
        return !this.connection;
    }

    public snapshot(): Promise<void> {
        const snapshot: IInkSnapshot = {
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.inkSnapshot),
        };

        return this.services.objectStorageService.write(this.id, this.id, snapshot);
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

    private async load(id: string, services: api.ICollaborationServices): Promise<void> {
        // Load the snapshot and begin listening for messages
        this.connection = await services.deltaNotificationService.connect(id, this.type);

        // Load from the snapshot if it exists
        const rawSnapshot = this.connection.existing && this.connection.versions.length > 0
            ? await services.objectStorageService.read(id, this.connection.versions[0].hash, id)
            : null;
        const snapshot: IInkSnapshot = rawSnapshot
            ? JSON.parse(rawSnapshot)
            : { sequenceNumber: 0, snapshot: {} };

        this.inkSnapshot = Snapshot.Clone(snapshot.snapshot);
        this.sequenceNumber = snapshot.sequenceNumber;

        // Emit the load event so listeners can redraw the new information
        this.events.emit("load");

        this.listenForUpdates();
    }

    private listenForUpdates() {
        this.deltaManager = new api.DeltaManager(
            this.sequenceNumber,
            this.services.deltaStorageService,
            this.connection,
            {
                getReferenceSequenceNumber: () => {
                    return this.sequenceNumber;
                },
                op: (message) => {
                    this.processRemoteMessage(message);
                },
            });
    }

    /**
     * Processes a message by the local client
     */
    private async processLocalOperation(op: IDelta): Promise<void> {
        // Prep the message
        const message: api.IMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            op,
            referenceSequenceNumber: this.sequenceNumber,
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
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this.sequenceNumber = message.sequenceNumber;

        if (message.type === api.OperationType) {
            this.processRemoteOperation(message as api.ISequencedMessage);
        }
    }

    /**
     * Processed a remote operation
     */
    private processRemoteOperation(message: api.ISequencedMessage) {
        if (message.clientId === this.connection.clientId) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.localOps.length > 0 &&
                this.localOps[0].clientSequenceNumber === message.clientSequenceNumber) {
                this.localOps.shift();
            } else {
                debug(`Duplicate ack received ${message.clientSequenceNumber}`);
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
