import * as assert from "assert";
import * as _ from "lodash";
import * as api from "../api";
import { debug } from "./debug";

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

const snapshotFileName = "value";

/**
 * Implementation of a cell collaborative object
 */
class Cell extends api.CollaborativeObject implements api.ICell {
    public type = CellExtension.Type;

    // Cell data
    private data: ICellValue;

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
    constructor(
        private document: api.Document,
        public id: string,
        private services?: api.IDistributedObjectServices,
        version?: string,
        header?: string) {
        super();

        if (services) {
            // Load from the snapshot if it exists
            const snapshot: ICellSnapshot = header
                ? JSON.parse(header)
                : { sequenceNumber: 0, snapshot: {} };
            this.data = snapshot.snapshot;
            this.sequenceNumber = snapshot.sequenceNumber;

            this.listenForUpdates();
        }
    }

    /**
     * Retrieves the value of the cell.
     */
    public async get() {
        const value = this.data;
        if (value.type === CellValueType[CellValueType.Collaborative]) {
            const collabCellValue = value.value as ICollaborativeCellValue;
            this.document.get(collabCellValue.id);
        } else {
            return value.value;
        }
    }

    /**
     * Sets the value of the cell.
     */
    public async set(value: any): Promise<void> {
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
        const op: ICellOperation = {
            type: "delete",
        };
        return this.processLocalOperation(op);
    }

    /**
     * Returns whether cell is empty or not.
     */
     public async empty() {
         return this.data === undefined ? true : false;
     }

    public snapshot(): Promise<api.IObject[]> {
        const snapshot = {
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.data),
        };

        return Promise.resolve([{ path: snapshotFileName, data: snapshot}]);
    }

    /**
     * Attaches the document to the given backend service.
     */
    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        this.services = this.document.attach(this);

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
        return !this.services;
    }

    private listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteMessage(message);
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
                collabObject.attach();
            }
        }

        this.services.deltaConnection.submitOp(message);
    }

    /**
     * Processes a message by the local client
     */
    private async processLocalOperation(op: ICellOperation): Promise<void> {
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
        if (this.services) {
            this.submit(message);
        }

        this.processOperation(op);
    }

    /**
     * Handles a message coming from the remote service
     */
    private processRemoteMessage(message: api.IBase) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.object.sequenceNumber);
        this.sequenceNumber = message.object.sequenceNumber;
        this.minimumSequenceNumber = message.object.minimumSequenceNumber;

        if (message.type === api.OperationType) {
            this.processRemoteOperation(message as api.ISequencedMessage);
        }
        // Brodcast the message to listeners.
        this.events.emit("op", message);
    }

    private processRemoteOperation(message: api.ISequencedMessage) {
        // server messages should only be delivered to this method in sequence number order
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

    public load(
        document: api.Document,
        id: string,
        services: api.IDistributedObjectServices,
        version: string,
        header: string): api.ICell {

        return new Cell(document, id, services, version, header);
    }

    public create(document: api.Document, id: string): api.ICell {
        return new Cell(document, id);
    }
}
