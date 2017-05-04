import * as assert from "assert";
import { EventEmitter } from "events";
import * as _ from "lodash";
import * as api from ".";
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

    // The value is a locally stored collaborative object
    CollaborativeLocal,

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

/**
 * Implementation of a map collaborative object
 */
class Map implements api.IMap {
    public type = MapExtension.Type;

    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    private events = new EventEmitter();
    private loadingP: Promise<void>;

    // Map data
    private data: any = {};

    // The last sequence number processed
    private connection: api.IDeltaConnection;
    private deltaManager: DeltaManager = null;

    // Locally applied operations not yet sent to the server
    private localOps: api.IMessage[] = [];

    // The last sequence number retrieved from the server
    private sequenceNumber = 0;

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(public id: string, private services?: api.ICollaborationServices, private registry?: api.Registry) {
        this.loadingP = services ? this.load(id, services) : Promise.resolve();
    }

    public async keys(): Promise<string[]> {
        await this.loadingP;
        return _.keys(this.data);
    }

    public async get(key: string) {
        await this.loadingP;
        return this.data[key];
    }

    public async has(key: string): Promise<boolean> {
        await this.loadingP;
        return key in this.data;
    }

    public async set(key: string, value: any): Promise<void> {
        await this.loadingP;

        // If a local collaborative object is being set we need to attach it to the document
        let operationValue: IMapValue = {
            type: ValueType[value.__collaborativeObject__ ? ValueType.CollaborativeLocal : ValueType.Plain],
            value,
        };

        const op: IMapOperation = {
            key,
            type: "set",
            value: operationValue,
        };

        return this.processLocalOperation(op);
    }

    public async delete(key: string): Promise<void> {
        await this.loadingP;
        const op: IMapOperation = {
            key,
            type: "delete",
        };

        return this.processLocalOperation(op);
    }

    public async clear(): Promise<void> {
        await this.loadingP;
        const op: IMapOperation = {
            type: "clear",
        };

        return this.processLocalOperation(op);
    }

    public on(event: string, listener: Function): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListener(event: string, listener: Function): this {
        this.events.removeListener(event, listener);
        return this;
    }

    public removeAllListeners(event?: string): this {
        this.events.removeAllListeners(event);
        return this;
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
        this.connection = await services.deltaNotificationService.connect(this.id);
        // TODO bring back assert.ok(!this.connection.existing);

        for (const localOp of this.localOps) {
            this.submit(localOp);
        }

        this.listenForUpdates();
    }

    /**
     * Returns true if the object is local only
     */
    public isLocal(): boolean {
        return !this.connection;
    }

    /**
     * Loads the map from an existing storage service
     */
    private async load(id: string, services: api.ICollaborationServices): Promise<void> {
        // Load the snapshot and begin listening for messages
        this.connection = await services.deltaNotificationService.connect(id);

        // Load from the snapshot if it exists
        const rawSnapshot = this.connection.existing ? await services.objectStorageService.read(id) : null;
        const snapshot: ISnapshot = rawSnapshot ? JSON.parse(rawSnapshot) : { sequenceNumber: 0, snapshot: {} };

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
                op: (message) => {
                    this.processRemoteOperation(message);
                },
            });
    }

    private async submit(message: api.IMessage): Promise<void> {
        // TODO chain these requests given the attach is async
        const op = message.op as IMapOperation;

        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === ValueType[ValueType.CollaborativeLocal]) {
            const localObject = op.value.value as api.ICollaborativeObject;
            if (localObject.isLocal()) {
                await localObject.attach(this.services, this.registry);
            }

            const transformedValue: ICollaborativeMapValue = {
                id: localObject.id,
                type: localObject.type,
            };

            const transformedMapValue: IMapValue = {
                type: ValueType[ValueType.Collaborative],
                value: transformedValue,
            };

            const transformedOp: IMapOperation = {
                key: op.key,
                type: op.type,
                value: transformedMapValue,
            };

            message = {
                clientSequenceNumber: message.clientSequenceNumber,
                op: transformedOp,
                referenceSequenceNumber: message.referenceSequenceNumber,
            };
        }

        this.connection.submitOp(message);
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
    private processRemoteOperation(message: api.ISequencedMessage) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this.sequenceNumber = message.sequenceNumber;

        if (message.clientId === this.connection.clientId) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.localOps.length > 0 &&
                this.localOps[0].clientSequenceNumber === message.clientSequenceNumber) {
                this.localOps.shift();
            } else {
                console.log(`Duplicate ack received ${message.clientSequenceNumber}`);
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
        const valueType = ValueType[value.type];

        if (valueType === ValueType.Collaborative) {
            const collaborativeMapValue = value.value as ICollaborativeMapValue;

            // Use the local value if available - otherwise we need to load the object from the server
            const extension = this.registry.getExtension(collaborativeMapValue.type);
            const collaborativeObject = extension.load(collaborativeMapValue.id, this.services, this.registry);

            this.data[key] = collaborativeObject;
        } else {
            this.data[key] = value.value;
        }

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
