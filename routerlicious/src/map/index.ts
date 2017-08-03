import * as assert from "assert";
import { EventEmitter } from "events";
import * as _ from "lodash";
import * as api from "../api";
import { debug } from "./debug";

/**
 * Description of a map delta operation
 */
interface IMapOperation {
    type: string;
    key?: string;
    value?: IMapValue;
}

/**
 * Map snapshot definition
 */
export interface ISnapshot {
    sequenceNumber: number;
    snapshot: any;
};

export enum ValueType {
    // The value is a collaborative object
    Collaborative,

    // The value is a plain JavaScript object
    Plain,
}

export interface ICollaborativeMapValue {
    // The type of collaborative object
    type: string;

    // The id for the collaborative object
    id: string;
}

export interface IMapValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}

const snapshotFileName = "header";

class MapView implements api.IMapView {
    private data: {[key: string]: IMapValue };

    // The last sequence number and offset retrieved from the server
    private sequenceNumber: number;
    private minimumSequenceNumber = 0;

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    // Locally applied operations not yet sent to the server
    private localOps: api.IMessage[] = [];

    constructor(
        private document: api.Document,
        id: string,
        private events: EventEmitter,
        private services?: api.IDistributedObjectServices,
        snapshot?: ISnapshot) {

        if (this.services) {
            this.data = snapshot.snapshot;
            this.sequenceNumber = snapshot.sequenceNumber;

            // Listen for updates to create the delta manager
            this.listenForUpdates();
        } else {
            this.data = {};
            this.sequenceNumber = 0;
        }
    }

    public get(key: string) {
        if (!(key in this.data)) {
            return undefined;
        }

        const value = this.data[key];
        if (value.type === ValueType[ValueType.Collaborative]) {
            const collabMapValue = value.value as ICollaborativeMapValue;
            return this.document.get(collabMapValue.id);
        } else {
            return this.data[key].value;
        }
    }

    public has(key: string): boolean {
        return key in this.data;
    }

    public set(key: string, value: any): Promise<void> {
        let operationValue: IMapValue;
        if (_.hasIn(value, "__collaborativeObject__")) {
            // Convert any local collaborative objects to our internal storage format
            const collaborativeObject = value as api.ICollaborativeObject;
            const collabMapValue: ICollaborativeMapValue = {
                id: collaborativeObject.id,
                type: collaborativeObject.type,
            };

            operationValue = {
                type: ValueType[ValueType.Collaborative],
                value: collabMapValue,
            };
        } else {
            operationValue = {
                type: ValueType[ValueType.Plain],
                value,
            };
        }

        const op: IMapOperation = {
            key,
            type: "set",
            value: operationValue,
        };

        return this.processLocalOperation(op);
    }

    public delete(key: string): Promise<void> {
        const op: IMapOperation = {
            key,
            type: "delete",
        };

        return this.processLocalOperation(op);
    }

    public keys(): string[] {
        return _.keys(this.data);
    }

    public clear(): Promise<void> {
        const op: IMapOperation = {
            type: "clear",
        };

        return this.processLocalOperation(op);
    }

    public snapshot(): Promise<api.IObject[]> {
        const snapshot = {
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.data),
        };

        return Promise.resolve([{ path: snapshotFileName, data: snapshot}]);
    }

    public attach(services: api.IDistributedObjectServices): void {
        this.services = services;

        // Listen for updates to create the delta manager
        this.listenForUpdates();

        // And then submit all pending operations
        for (const localOp of this.localOps) {
            this.submit(localOp);
        }
    }

    /**
     * Processes a message by the local client
     */
    private async processLocalOperation(op: IMapOperation): Promise<void> {
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

    private processOperation(op: IMapOperation) {
        switch (op.type) {
            case "clear":
                this.clearCore();
                break;
            case "delete":
                this.deleteCore(op.key);
                break;
            case "set":
                this.setCore(op.key, op.value);
                break;
            default:
                throw new Error("Unknown operation");
        }
    }

    private setCore(key: string, value: IMapValue) {
        this.data[key] = value;
        this.events.emit("valueChanged", { key });
    }

    private clearCore() {
        this.data = {};
        this.events.emit("clear");
    }

    private deleteCore(key: string) {
        delete this.data[key];
        this.events.emit("valueChanged", { key });
    }

    private listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteMessage(message);
        });
    }

    private async submit(message: api.IMessage): Promise<void> {
        // TODO chain these requests given the attach is async
        const op = message.op as IMapOperation;

        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === ValueType[ValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message so that its state is available
            // to upstream users following the attach
            const collabMapValue = op.value.value as ICollaborativeMapValue;
            const collabObject = this.document.get(collabMapValue.id);
            collabObject.attach();
        }

        this.services.deltaConnection.submitOp(message);
    }
}

/**
 * Implementation of a map collaborative object
 */
class Map extends api.CollaborativeObject implements api.IMap {
    public type = MapExtension.Type;

    private view: MapView;
    private local: boolean;

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        private document: api.Document,
        public id: string,
        private services?: api.IDistributedObjectServices,
        version?: string,
        header?: string) {

        super();

        if (this.services) {
            this.local = false;

            // Load from the snapshot if available
            const snapshot: ISnapshot = header
                ? JSON.parse(header)
                : { sequenceNumber: 0, snapshot: {} };

            this.view = new MapView(this.document, id, this.events, services, snapshot);
        } else {
            this.local = true;
            this.view = new MapView(this.document, id, this.events);
        }
    }

    public async keys(): Promise<string[]> {
        return Promise.resolve(this.view.keys());
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get(key: string) {
        return Promise.resolve(this.view.get(key));
    }

    public has(key: string): Promise<boolean> {
        return Promise.resolve(this.view.has(key));
    }

    public set(key: string, value: any): Promise<void> {
        return Promise.resolve(this.view.set(key, value));
    }

    public delete(key: string): Promise<void> {
        return Promise.resolve(this.view.delete(key));
    }

    public clear(): Promise<void> {
        return Promise.resolve(this.view.clear());
    }

    public snapshot(): Promise<api.IObject[]> {
        return Promise.resolve(this.view.snapshot());
    }

    /**
     * Returns true if the object is local only
     */
    public isLocal(): boolean {
        return this.local;
    }

    /**
     * Returns a synchronous view of the map
     */
    public getView(): Promise<api.IMapView> {
        return Promise.resolve(this.view);
    }

    /**
     * Attaches the document to the given backend service.
     */
    public attach(): this {
        if (!this.local) {
            return this;
        }

        const services = this.document.attach(this);
        this.view.attach(services);

        return this;
    }
}

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public load(
        document: api.Document,
        id: string,
        services: api.IDistributedObjectServices,
        version: string,
        header: string): api.IMap {

        return new Map(document, id, services, version, header);
    }

    public create(document: api.Document, id: string): api.IMap {
        return new Map(document, id);
    }
}
