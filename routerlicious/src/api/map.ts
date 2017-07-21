import * as assert from "assert";
import { EventEmitter } from "events";
import * as _ from "lodash";
import * as api from ".";
import { debug } from "./debug";
import { DeltaManager } from "./deltaManager";

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

const snapshotFileName = "value";

class MapView implements api.IMapView {
    // Map of collaborative objects stored inside of the map
    private collaborativeObjects: {[id: string]: api.ICollaborativeObject} = {};

    private data: {[key: string]: IMapValue };

    // The last sequence number and offset retrieved from the server
    private sequenceNumber: number;
    private minimumSequenceNumber = 0;

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    private deltaManager: DeltaManager = null;

    // Locally applied operations not yet sent to the server
    private localOps: api.IMessage[] = [];

    constructor(
        private id: string,
        private events: EventEmitter,
        private connection?: api.IDeltaConnection,
        private services?: api.ICollaborationServices,
        private registry?: api.Registry,
        snapshot?: ISnapshot) {

        if (connection) {
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
            if (!(collabMapValue.id in this.collaborativeObjects)) {
                const extension = this.registry.getExtension(collabMapValue.type);
                this.collaborativeObjects[collabMapValue.id] =
                    extension.load(collabMapValue.id, this.services, this.registry);
            }

            return this.collaborativeObjects[collabMapValue.id];
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
            this.collaborativeObjects[collaborativeObject.id] = collaborativeObject;

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

    public snapshot(): Promise<void> {
        const snapshot = {
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.data),
        };

        return this.services.objectStorageService.write(this.id, [{ path: snapshotFileName, data: snapshot}]);
    }

    public async attach(
        connection: api.IDeltaConnection,
        services: api.ICollaborationServices,
        registry: api.Registry): Promise<void> {

        this.connection = connection;
        this.services = services;
        this.registry = registry;

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
        const op = message.op as IMapOperation;

        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === ValueType[ValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message
            const collabMapValue = op.value.value as ICollaborativeMapValue;
            const collabObject = this.collaborativeObjects[collabMapValue.id];

            if (collabObject.isLocal()) {
                await collabObject.attach(this.services, this.registry);
            }
        }

        this.deltaManager.submitOp(message);
    }
}

/**
 * Implementation of a map collaborative object
 */
class Map extends api.CollaborativeObject implements api.IMap {
    public type = MapExtension.Type;

    private viewP: Promise<MapView>;
    private local: boolean;
    private attaching = false;

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(public id: string, services?: api.ICollaborationServices, registry?: api.Registry) {
        super();
        this.local = !services;
        this.viewP = this.local
            ? Promise.resolve(new MapView(id, this.events))
            : this.load(id, services, registry);
    }

    public async keys(): Promise<string[]> {
        const view = await this.viewP;
        return view.keys();
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public async get(key: string) {
        const view = await this.viewP;
        return view.get(key);
    }

    public async has(key: string): Promise<boolean> {
        const view = await this.viewP;
        return view.has(key);
    }

    public async set(key: string, value: any): Promise<void> {
        const view = await this.viewP;
        return view.set(key, value);
    }

    public async delete(key: string): Promise<void> {
        const view = await this.viewP;
        return view.delete(key);
    }

    public async clear(): Promise<void> {
        const view = await this.viewP;
        return view.clear();
    }

    public async snapshot(): Promise<void> {
        const view = await this.viewP;
        return view.snapshot();
    }

    /**
     * Attaches the document to the given backend service.
     */
    public async attach(services: api.ICollaborationServices, registry: api.Registry): Promise<void> {
        if (!this.local) {
            throw new Error("Already attached");
        }

        if (this.attaching) {
            throw new Error("Attach in progress");
        }

        this.attaching = true;
        return this.attachCore(services, registry).then(
            () => {
                this.attaching = false;
                this.local = false;
            },
            (error) => {
                this.attaching = false;
            });
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
    public async getView(): Promise<api.IMapView> {
        return this.viewP;
    }

    private async attachCore(services: api.ICollaborationServices, registry: api.Registry) {
        const view = await this.viewP;

        // Attaching makes a local document available for collaboration. The connect call should create the object.
        // We assert the return type to validate this is the case.
        const connection = await services.deltaNotificationService.connect(this.id, this.type);
        assert.ok(!connection.existing);

        return view.attach(connection, services, registry);
    }

    /**
     * Loads the map from an existing storage service
     */
    private async load(id: string, services: api.ICollaborationServices, registry?: api.Registry): Promise<MapView> {
        // Load the snapshot and begin listening for messages
        const connection = await services.deltaNotificationService.connect(id, this.type);

        // Load from the snapshot if it exists
        const rawSnapshot = connection.existing && connection.versions.length > 0
            ? await services.objectStorageService.read(id, connection.versions[0].sha, snapshotFileName)
            : null;
        const snapshot: ISnapshot = rawSnapshot
            ? JSON.parse(rawSnapshot)
            : { sequenceNumber: 0, snapshot: {} };

        return new MapView(id, this.events, connection, services, registry, snapshot);
    }
}

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public load(id: string, services: api.ICollaborationServices, registry: api.Registry): api.IMap {
        return new Map(id, services, registry);
    }

    public create(id: string): api.IMap {
        return new Map(id);
    }
}
