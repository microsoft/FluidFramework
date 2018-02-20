import * as resources from "gitresources";
import * as api from "../api-core";
import { getOrDefault } from "../core-utils";
import { ICounter, IMap, IMapView, ISet } from "../data-types";
import { IMapOperation } from "./definitions";
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

export interface IMapMessageHandler {
    prepare(map: CollaborativeMap, op: IMapOperation): Promise<any>;
    process(map: CollaborativeMap, op: IMapOperation, context: any): void;
}

/**
 * Implementation of a map collaborative object
 */
export class CollaborativeMap extends api.CollaborativeObject implements IMap {
    /**
     * Initializes message handlers for inbound map messages
     */
    public static initializeMessageHandler() {
        if (CollaborativeMap.messageHandler) {
            return;
        }

        const defaultPrepare = (map: CollaborativeMap, op: IMapOperation) => Promise.resolve();

        const handler = new Map<string, IMapMessageHandler>();
        handler.set(
            "clear",
            {
                prepare: defaultPrepare,
                process: (map, op, context) => map.view.clearCore(),
            });
        handler.set(
            "delete",
            {
                prepare: defaultPrepare,
                process: (map, op, context) => map.view.deleteCore(op.key),
            });
        handler.set(
            "set",
            {
                prepare: (map, op) => map.view.prepareSetCore(op.key, op.value),
                process: (map, op, context) => map.view.setCore(op.key, context.type, context.value),
            });
        handler.set(
            "initCounter",
            {
                prepare: defaultPrepare,
                process: (map, op, context) => map.view.initCounterCore(op.key, op.value),
            });
        handler.set(
            "incrementCounter",
            {
                prepare: defaultPrepare,
                process: (map, op, context) => map.view.incrementCounterCore(op.key, op.value),
            });
        handler.set(
            "initSet",
            {
                prepare: defaultPrepare,
                process: (map, op, context) => map.view.initSetCore(op.key, op.value),
            });
        handler.set(
            "insertSet",
            {
                prepare: defaultPrepare,
                process: (map, op, context) => map.view.insertSetCore(op.key, op.value),
            });
        handler.set(
            "deleteSet",
            {
                prepare: defaultPrepare,
                process: (map, op, context) => map.view.deleteSetCore(op.key, op.value),
            });

        CollaborativeMap.messageHandler = handler;
    }

    private static messageHandler: Map<string, IMapMessageHandler>;

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
        CollaborativeMap.initializeMessageHandler();
        this.view = new MapView(
            this,
            this.document,
            this.id);
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
        return this.view.initCounter(key, value, min, max);
    }

    public createSet<T>(key: string, value?: T[]): ISet<T> {
        value = getOrDefault(value, []);
        return this.view.initSet(key, value);
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
        let handled = message.type === api.OperationType
            ? CollaborativeMap.messageHandler.has((message.contents as IMapOperation).type)
            : false;

        if (!handled) {
            message = this.transformContent(message, sequenceNumber);
        }

        return message;
    }

    public submitMapMessage(op: any): void {
        // Local operations do not require any extra processing
        if (this.isLocal()) {
            return;
        }

        // Once we have performed the attach submit the local operation
        this.submitLocalMessage(op);
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
        await this.view.populate(data);

        const contentStorage = new ContentObjectStorage(storage);
        await this.loadContent(version, headerOrigin, contentStorage);
    }

    protected initializeLocalCore() {
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

    protected prepareCore(message: api.ISequencedObjectMessage): Promise<any> {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op: IMapOperation = message.contents;
            if (CollaborativeMap.messageHandler.has(op.type)) {
                return CollaborativeMap.messageHandler.get(op.type).prepare(this, op);
            }
        }

        return this.prepareContent(message);
    }

    protected processCore(message: api.ISequencedObjectMessage, context: any) {
        let handled = false;
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op: IMapOperation = message.contents;
            if (CollaborativeMap.messageHandler.has(op.type)) {
                CollaborativeMap.messageHandler.get(op.type).process(this, op, context);
                handled = true;
            }
        }

        if (!handled) {
            this.processContent(message, context);
        }

        this.emit("op", message);
    }

    protected attachCore() {
        this.view.attachAll();

        this.attachContent();
    }

    // The following three methods enable derived classes to provide custom content that is stored
    // with the map

    protected attachContent() {
        return;
    }

    protected async prepareContent(message: api.ISequencedObjectMessage): Promise<any> {
        return;
    }

    /**
     * Processes a content message
     */
    protected processContent(message: api.ISequencedObjectMessage, context: any) {
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
}
