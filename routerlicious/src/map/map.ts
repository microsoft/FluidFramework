import * as resources from "gitresources";
import * as api from "../api-core";
import { getOrDefault } from "../core-utils";
import { ICounter, IMap, IMapView, ISet } from "../data-types";
import { ICollaborativeMapValue, IMapDataCompatibility, IMapOperation, ValueType } from "./definitions";
import { MapExtension } from "./extension";
import { MapView } from "./view";

const snapshotFileName = "header";

/**
 * Copies all values from the provided MapView to the given Map
 */
export function copyMap(from: IMapView, to: Map<string, any>) {
    from.forEach((value, key) => {
        to.set(key, value);
    });
}

/**
 * Implementation of a map collaborative object
 */
export class CollaborativeMap extends api.CollaborativeObject implements IMap {
    private view: MapView;

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        document: api.IDocument,
        type = MapExtension.Type) {

        super(id, document, type);

        // TODO I need some kind of default state!
    }

    public async keys(): Promise<string[]> {
        return Promise.resolve(Array.from(this.view.keys()));
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get(key: string) {
        return Promise.resolve(this.view.get(key));
    }

    public async wait<T>(key: string): Promise<T> {
        return this.view.wait<T>(key);
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

    public createCounter(key: string, value?: number, min?: number, max?: number): ICounter {
        value = getOrDefault(value, 0);
        min = getOrDefault(min, Number.MIN_SAFE_INTEGER);
        max = getOrDefault(max, Number.MAX_SAFE_INTEGER);
        if (!(typeof value === "number" && typeof min === "number" && typeof max === "number")) {
            throw new Error("parameters should be of number type!");
        }
        if (value < min || value > max) {
            throw new Error("Initial value exceeds the counter range!");
        }
        return this.view.initCounter(this, key, value, min, max);
    }

    public incrementCounter(key: string, value: number, min: number, max: number): ICounter {
        if (typeof value !== "number") {
            throw new Error("Incremental amount should be a number.");
        }
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Counter]);
        if (compatible.reject !== null) {
            throw new Error("Incompatible type.");
        }
        const currentData = compatible.data;
        const currentValue = currentData.value as ICounter;
        const nextValue = currentValue.get() + value;
        if ((nextValue < min) || (nextValue > max)) {
            throw new Error("Error: Counter range exceeded!");
        }
        return this.view.incrementCounter(key, value);
    }

    public getCounterValue(key: string): Promise<number> {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Counter]);
        return compatible.reject !== null ? compatible.reject : Promise.resolve(compatible.data.value);
    }

    public createSet<T>(key: string, value?: T[]): ISet<T> {
        value = getOrDefault(value, []);
        return this.view.initSet(this, key, value);
    }

    public insertSet<T>(key: string, value: T): ISet<T> {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        return compatible.reject !== null ? null : this.view.insertSet(key, value);
    }

    public deleteSet<T>(key: string, value: T): ISet<T> {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        return compatible.reject !== null ? null : this.view.deleteSet(key, value);
    }

    public enumerateSet<T>(key: string): any[] {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        if (compatible.reject !== null) {
            return null;
        }
        const resultSet = compatible.data.value as ISet<T>;
        return Array.from(resultSet.getInternalSet().values());
    }

    public snapshot(): api.ITree {
        const tree: api.ITree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: this.view.serialize(),
                        encoding: "utf-8",
                    },
                },
            ],
        };

        if (1 === 1 * 1) {
            throw new Error("Include the content !!!");
        }

        return tree;
    }

    public transform(message: api.IObjectMessage, sequenceNumber: number): api.IObjectMessage {
        throw new Error("Implement me!!!");
    }

    /**
     * Returns a synchronous view of the map
     */
    public getView(): Promise<IMapView> {
        return Promise.resolve(this.view);
    }

    protected loadCore(
        sequenceNum: number,
        version: resources.ICommit,
        header: string,
        services: api.IDistributedObjectServices) {

        // TODO 1 fill me in with previous header stuff for local only case
        const data = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : {};
        this.view = new MapView(this.document, this.id, data, this, (op) => this.submitLocalMessage(op));
        this.deserialize();
    }

    protected initializeLocalCore() {
        // TODO 2 this is the base empty case
        throw new Error("Not implemented");
    }

    protected submitCore(message: api.IObjectMessage) {
        // TODO need to call this again at the time of the submit

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

    protected processMinSequenceNumberChanged(value: number) {
        // TODO need our own concept of the zamboni here

        // TODO this needs to invoke the content
    }

    protected processCore(message: api.ISequencedObjectMessage) {
        // TODO are the below checks what we want???
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op: IMapOperation = message.contents;

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
                case "initCounter":
                    this.view.initCounterCore(this, op.key, op.value);
                    break;
                case "incrementCounter":
                    this.view.incrementCounterCore(op.key, op.value);
                    break;
                case "initSet":
                    this.view.initSetCore(this, op.key, op.value);
                    break;
                case "insertSet":
                    this.view.insertSetCore(op.key, op.value);
                    break;
                case "deleteSet":
                    this.view.deleteSetCore(op.key, op.value);
                    break;
                default:
                    // default the operation to the content
                    this.processContent(message);
            }
        }

        this.emit("op", message);
    }

    protected attachCore() {
        this.attachContent();
    }

    // The following three methods enable derived classes to provide custom content that is stored
    // with the map

    protected attachContent() {
        return;
    }

    /**
     * Processes a content message
     */
    protected processContent(message: api.ISequencedObjectMessage) {
        throw new Error("Unknown operation");
    }

    /**
     * Snapshots the content
     */
    protected snapshotContent(): api.ITree {
        return null;
    }

    /**
     * Notifies the content that the minimum sequence number has changed
     */
    protected processMinSequenceNumberChangedContent(value: number) {
        // no-op
    }

    // Deserializes the map values into specific types (e.g., set, counter etc.)
    private deserialize() {
        const mapView = this.view;
        const keys = mapView.keys();
        for (let key of keys) {
            const value = mapView.getMapValue(key);
            if (value !== undefined) {
                switch (value.type) {
                    case ValueType[ValueType.Set]:
                        mapView.loadSet(this, key, value.value);
                        break;
                    case ValueType[ValueType.Counter]:
                        mapView.loadCounter(this, key, value.value.value, value.value.min, value.value.max);
                        break;
                    default:
                        break;
                }
            }
        }
    }

    // Check if key exists in the map and if the value type is of the desired type (e.g., set, counter etc.)
    private ensureCompatibility(key: string, targetType: string): IMapDataCompatibility {
        const currentData = this.view.getMapValue(key);
        if (currentData === undefined) {
            return {
                data: null,
                reject: Promise.reject("Error: No key found!"),
            };
        }
        if (currentData.type !== targetType) {
            return {
                data: null,
                reject: Promise.reject("Error: Incompatible value type!"),
            };
        }
        return {
            data: currentData,
            reject: null,
        };
    }
}
