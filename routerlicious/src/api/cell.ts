import * as assert from "assert";
import * as _ from "lodash";
import * as api from ".";
import { debug } from "./debug";
import { DeltaManager } from "./deltaManager";

/**
 * Description of a cell delta operation
 */
interface ICellOperation {
    type: string;
    value?: ICellValue;
}

/**
 * Cell snapshot definition
 */
export interface ICellSnapshot {
    offset: number;
    sequenceNumber: number;
    snapshot: any;
};

export enum CellValueType {
    // The value is another collaborative object
    Collaborative,

    // The value is a plain JavaScript object
    Plain,
}

export interface ICollaborativeCellValue {
    // The type of collaborative object
    type: string;

    // The id for the collaborative object
    id: string;
}

export interface ICellValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}

/**
 * Implementation of a cell collaborative object
 */
class Cell extends api.CollaborativeObject implements api.ICell {
    public type = CellExtension.Type;

    private loadingP: Promise<void>;

    // Cell data
    private data: ICellValue;

    // The last sequence number processed
    private connection: api.IDeltaConnection;
    private deltaManager: DeltaManager = null;

    // Locally applied operations not yet sent to the server
    private localOps: api.IMessage[] = [];

    // The last sequence number and offset retrieved from the server
    private sequenceNumber = 0;
    private minimumSequenceNumber = 0;

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    // Map of collaborative objects stored inside of the cell
    private collaborativeObjects: {[id: string]: api.ICollaborativeObject} = {};

    /**
     * Constructs a new collaborative cell. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(public id: string, private services?: api.ICollaborationServices, private registry?: api.Registry) {
        super();
        this.loadingP = services ? this.load(id, services) : Promise.resolve();
    }

    /**
     * Retrieves the value of the cell.
     */
    public async get() {
        await this.loadingP;

        const value = this.data;
        if (value.type === CellValueType[CellValueType.Collaborative]) {
            const collabCellValue = value.value as ICollaborativeCellValue;
            if (!(collabCellValue.id in this.collaborativeObjects)) {
                const extension = this.registry.getExtension(collabCellValue.type);
                this.collaborativeObjects[collabCellValue.id] =
                    extension.load(collabCellValue.id, this.services, this.registry);
            }

            return this.collaborativeObjects[collabCellValue.id];
        } else {
            return value.value;
        }
    }

    /**
     * Sets the value of the cell.
     */
    public async set(value: any): Promise<void> {
        await this.loadingP;

        let operationValue: ICellValue;
        if (_.hasIn(value, "__collaborativeObject__")) {
            // Convert any local collaborative objects to our internal storage format
            const collaborativeObject = value as api.ICollaborativeObject;
            this.collaborativeObjects[collaborativeObject.id] = collaborativeObject;

            const collabCellValue: ICollaborativeCellValue = {
                id: collaborativeObject.id,
                type: collaborativeObject.type,
            };

            operationValue = {
                type: CellValueType[CellValueType.Collaborative],
                value: collabCellValue,
            };
        } else {
            operationValue = {
                type: CellValueType[CellValueType.Plain],
                value,
            };
        }

        const op: ICellOperation = {
            type: "set",
            value: operationValue,
        };

        return this.processLocalOperation(op);
    }

    // Deletes the value from the cell.
    public async delete(): Promise<void> {
        await this.loadingP;
        const op: ICellOperation = {
            type: "delete",
        };
        return this.processLocalOperation(op);
    }

    /**
     * Returns whether cell is empty or not.
     */
     public async empty() {
         await this.loadingP;
         return this.data === undefined ? true : false;
     }

    public snapshot(): Promise<void> {
        const snapshot = {
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.data),
        };

        return this.services.objectStorageService.write(this.id, snapshot);
    }

    /**
     * Attaches the document to the given backend service.
     */
    public async attach(services: api.ICollaborationServices, registry: api.Registry): Promise<void> {
        this.services = services;
        this.registry = registry;

        // Attaching makes a local document available for collaboration. The connect call should create the object.
        // We assert the return type to validate this is the case.
        this.connection = await services.deltaNotificationService.connect(this.id, this.type);
        assert.ok(!this.connection.existing);

        // Listen for updates to create the delta manager
        this.listenForUpdates();

        // And then submit all pending operations.
        for (const localOp of this.localOps) {
            this.submit(localOp);
        }
    }

    /**
     * Returns true if the object is local only
     */
    public isLocal(): boolean {
        return !this.connection;
    }

    /**
     * Loads the cell from an existing storage service
     */
    private async load(id: string, services: api.ICollaborationServices): Promise<void> {
        // Load the snapshot and begin listening for messages
        this.connection = await services.deltaNotificationService.connect(id, this.type);

        // Load from the snapshot if it exists
        const rawSnapshot = this.connection.existing ? await services.objectStorageService.read(id) : null;
        const snapshot: ICellSnapshot = rawSnapshot
            ? JSON.parse(rawSnapshot)
            : { sequenceNumber: 0, snapshot: {} };

        this.data = snapshot.snapshot;
        this.sequenceNumber = snapshot.sequenceNumber;

        this.listenForUpdates();
    }

    private listenForUpdates() {
        this.deltaManager = new DeltaManager(
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

    private async submit(message: api.IMessage): Promise<void> {
        // TODO chain these requests given the attach is async
        const op = message.op as ICellOperation;

        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === CellValueType[CellValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message
            const collabMapValue = op.value.value as ICollaborativeCellValue;
            const collabObject = this.collaborativeObjects[collabMapValue.id];

            if (collabObject.isLocal()) {
                await collabObject.attach(this.services, this.registry);
            }
        }

        this.deltaManager.submitOp(message);
    }

    /**
     * Processes a message by the local client
     */
    private async processLocalOperation(op: ICellOperation): Promise<void> {
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

        this.processOperation(op);
    }

    /**
     * Handles a message coming from the remote service
     */
    private processRemoteMessage(message: api.IBase) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this.sequenceNumber = message.sequenceNumber;
        this.minimumSequenceNumber = message.minimumSequenceNumber;

        if (message.type === api.OperationType) {
            this.processRemoteOperation(message as api.ISequencedMessage);
        }
        // Brodcast the message to listeners.
        this.events.emit("op", message);
    }

    private processRemoteOperation(message: api.ISequencedMessage) {
        // server messages should only be delivered to this method in sequence number order
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
            this.processOperation(message.op);
        }
    }

    private processOperation(op: ICellOperation) {
        switch (op.type) {
            case "set":
                this.setCore(op.value);
                break;
            case "delete":
                this.deleteCore();
                break;
            default:
                throw new Error("Unknown operation");
        }
    }

    private setCore(value: ICellValue) {
        this.data = value;
        this.events.emit("valueChanged", { value });
    }

    private deleteCore() {
        delete this.data;
        this.events.emit("delete");
    }
}

/**
 * The extension that defines the map
 */
export class CellExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/cell";

    public type: string = CellExtension.Type;

    public load(id: string, services: api.ICollaborationServices, registry: api.Registry): api.ICell {
        return new Cell(id, services, registry);
    }

    public create(id: string): api.ICell {
        return new Cell(id);
    }
}
