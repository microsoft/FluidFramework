import { EventEmitter } from "events";
import * as _ from "lodash";
import * as api from "../api";

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
    minimumSequenceNumber: number;
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
    constructor(
        private document: api.Document,
        id: string,
        private data: {[key: string]: IMapValue },
        private events: EventEmitter,
        private processLocalOperation: (op) => Promise<void>) {
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

    public getData(): {[key: string]: IMapValue } {
        return _.clone(this.data);
    }

    public setCore(key: string, value: IMapValue) {
        this.data[key] = value;
        this.events.emit("valueChanged", { key });
    }

    public clearCore() {
        this.data = {};
        this.events.emit("clear");
    }

    public deleteCore(key: string) {
        delete this.data[key];
        this.events.emit("valueChanged", { key });
    }
}

/**
 * Implementation of a map collaborative object
 */
class Map extends api.CollaborativeObject implements api.IMap {
    private view: MapView;

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        document: api.Document,
        id: string,
        services?: api.IDistributedObjectServices,
        version?: string,
        header?: string) {
        let snapshot: ISnapshot = services && header
            ? JSON.parse(header)
            : { minimumSequenceNumber: 0, sequenceNumber: 0, snapshot: {} };

        super(document, id, MapExtension.Type, snapshot.sequenceNumber, snapshot.minimumSequenceNumber, services);

        this.view = new MapView(document, id, snapshot.snapshot, this.events, (op) => this.processLocalOperation(op));
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
        const snapshot = {
            minimumSequenceNumber: this.minimumSequenceNumber,
            sequenceNumber: this.sequenceNumber,
            snapshot: this.view.getData(),
        };

        return Promise.resolve([{ path: snapshotFileName, data: snapshot}]);
    }

    /**
     * Returns a synchronous view of the map
     */
    public getView(): Promise<api.IMapView> {
        return Promise.resolve(this.view);
    }

    protected submitCore(message: api.IObjectMessage) {
        // TODO chain these requests given the attach is async
        const op = message.contents as IMapOperation;

        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === ValueType[ValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message so that its state is available
            // to upstream users following the attach
            const collabMapValue = op.value.value as ICollaborativeMapValue;
            const collabObject = this.document.get(collabMapValue.id);
            collabObject.attach();
        }
    }

    protected processCore(op: IMapOperation) {
        switch (op.type) {
            case "clear":
                this.view.clearCore();
                break;
            case "delete":
                this.view.deleteCore(op.key);
                break;
            case "set":
                this.view.setCore(op.key, op.value);
                break;
            default:
                throw new Error("Unknown operation");
        }
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
