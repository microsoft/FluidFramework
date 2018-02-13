import * as resources from "gitresources";
import * as api from "../api-core";
import { getOrDefault } from "../core-utils";
import { ICounter, IMap, IMapView, ISet } from "../data-types";
import { ICollaborativeMapValue, IMapDataCompatibility, IMapOperation, ValueType } from "./definitions";
import { MapExtension } from "./extension";
import { MapView } from "./view";

const snapshotFileName = "header";
const contentPath = "content";

/**
 * Copies all values from the provided MapView to the given Map
 */
export function copyMap(from: IMapView, to: Map<string, any>) {
    from.forEach((value, key) => {
        to.set(key, value);
    });
}

class ContentObjectStorage implements api.IObjectStorageService {
    constructor(private storage: api.IObjectStorageService) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(`content/${path}`);
    }
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

        const contentSnapshot = this.snapshotContent();
        if (contentSnapshot) {
            tree.entries.push({
                path: contentPath,
                type: api.TreeEntry[api.TreeEntry.Tree],
                value: contentSnapshot,
            });
        }

        return tree;
    }

    public transform(message: api.IObjectMessage, sequenceNumber: number): api.IObjectMessage {
        let handled = false;
        if (message.type === api.OperationType) {
            const op: IMapOperation = message.contents;

            handled = true;
            switch (op.type) {
                case "clear":
                    break;
                case "delete":
                    break;
                case "set":
                    break;
                case "initCounter":
                    break;
                case "incrementCounter":
                    break;
                case "initSet":
                    break;
                case "insertSet":
                    break;
                case "deleteSet":
                    break;
                default:
                    handled = false;
            }
        }

        if (!handled) {
            message = this.transformContent(message, sequenceNumber);
        }

        return message;
    }

    /**
     * Returns a synchronous view of the map
     */
    public getView(): Promise<IMapView> {
        return Promise.resolve(this.view);
    }

    protected async loadCore(
        version: resources.ICommit,
        headerOrigin: string,
        storage: api.IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : {};
        this.initializeView(data);

        const contentStorage = new ContentObjectStorage(storage);
        await this.loadContent(version, headerOrigin, contentStorage);
    }

    protected initializeLocalCore() {
        this.initializeView({});
        this.initializeContent();
    }

    protected processMinSequenceNumberChanged(value: number) {
        // TODO need our own concept of the zamboni here
        this.processMinSequenceNumberChangedContent(value);
    }

    protected async loadContent(
        version: resources.ICommit,
        headerOrigin: string,
        services: api.IObjectStorageService): Promise<void> {
        return;
    }

    protected initializeContent() {
        return;
    }

    protected processCore(message: api.ISequencedObjectMessage) {
        let handled = false;
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op: IMapOperation = message.contents;

            handled = true;
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
                    handled = false;
            }
        }

        if (!handled) {
            this.processContent(message);
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
        return;
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
        return;
    }

    /**
     * Allows derived classes to transform the given message
     */
    protected transformContent(message: api.IObjectMessage, sequenceNumber: number): api.IObjectMessage {
        return message;
    }

    private initializeView(data: any) {
        this.view = new MapView(
            this.document,
            this.id,
            data,
            this,
            (op) => {
                // Local operations do not require any extra processing
                if (this.isLocal()) {
                    return;
                }

                // We need to translate any local collaborative object sets to the serialized form
                if (op.type === "set" && op.value.type === ValueType[ValueType.Collaborative]) {
                    // We need to attach the object prior to submitting the message so that its state is available
                    // to upstream users following the attach
                    const collabMapValue = op.value.value as ICollaborativeMapValue;
                    const collabObject = this.document.get(collabMapValue.id);
                    collabObject.attach();
                }

                // Once we have performed the attach submit the local operation
                this.submitLocalMessage(op);
            });

        // This should probably be done on data - like with the collab objects - prior to giving to view.
        // Or have the view do all the loading
        for (let key of this.view.keys()) {
            const value = this.view.getMapValue(key);
            if (value !== undefined) {
                switch (value.type) {
                    case ValueType[ValueType.Set]:
                        this.view.loadSet(this, key, value.value);
                        break;
                    case ValueType[ValueType.Counter]:
                        this.view.loadCounter(this, key, value.value.value, value.value.min, value.value.max);
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
