import * as api from "../api-core";
import { IMap, IMapView, IValueChanged, IValueOperation, IValueType, SerializeFilter } from "../data-types";
import { debug } from "./debug";
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

interface IMapMessageHandler {
    prepare(op: IMapOperation, local: boolean, message: api.ISequencedObjectMessage): Promise<any>;
    process(op: IMapOperation, context: any, local: boolean, message: api.ISequencedObjectMessage): void;
}

/**
 * Implementation of a map collaborative object
 */
export class CollaborativeMap extends api.CollaborativeObject implements IMap {
    private messageHandler: Map<string, IMapMessageHandler>;
    private view: MapView;
    private serializeFilter: SerializeFilter;
    private valueTypes = new Map<string, IValueType<any>>();

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        document: api.IDocument,
        type = MapExtension.Type) {

        super(id, document, type);
        const defaultPrepare = (op: IMapOperation, local: boolean) => Promise.resolve();
        this.serializeFilter = (key, value, valueType) => value;

        this.messageHandler = new Map<string, IMapMessageHandler>();
        this.messageHandler.set(
            "clear",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    if (local) {
                        return;
                    }

                    this.view.clearCore(local, message);
                },
            });
        this.messageHandler.set(
            "delete",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    if (local) {
                        return;
                    }

                    return this.view.deleteCore(op.key, local, message);
                },
            });
        this.messageHandler.set(
            "set",
            {
                prepare: (op, local) => {
                    return local ? null : this.view.prepareSetCore(op.key, op.value);
                },
                process: (op, context, local, message) => {
                    if (local) {
                        return;
                    }

                    this.view.setCore(op.key, context, local, message);
                },
            });

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

    public set<T>(key: string, value: any, type?: string): T {
        return this.view.set(key, value, type);
    }

    public delete(key: string): Promise<void> {
        return Promise.resolve(this.view.delete(key));
    }

    public clear(): Promise<void> {
        return Promise.resolve(this.view.clear());
    }

    public ready(): Promise<void> {
        return this.readyContent();
    }

    public snapshot(): api.ITree {
        const tree: api.ITree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: this.view.serialize(this.serializeFilter),
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
            ? this.messageHandler.has((message.contents as IMapOperation).type)
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

    /**
     * Registers a new value type on the map
     */
    public registerValueType<T>(type: IValueType<T>) {
        this.valueTypes.set(type.name, type);

        function getOpHandler(op: IMapOperation): IValueOperation<T> {
            const handler = type.ops.get(op.value.type);
            if (!handler) {
                throw new Error("Unknown type message");
            }

            return handler;
        }

        const valueTypeMessageHandler: IMapMessageHandler = {
            prepare: async (op, local, message) => {
                const handler = getOpHandler(op);
                const value = this.view.get(op.key);
                return handler.prepare(value, op.value.value, local, message);
            },

            process: (op, context, local, message) => {
                const handler = getOpHandler(op);
                const value = this.view.get(op.key);
                handler.process(value, op.value.value, context, local, message);
                this.emit("valueChanged", { key: op.key }, local, message);
            },
        };

        this.messageHandler.set(type.name, valueTypeMessageHandler);
    }

    public hasValueType(type: string): boolean {
        return this.valueTypes.has(type);
    }

    public getValueType(type: string) {
        return this.valueTypes.get(type);
    }

    public registerSerializeFilter(filter: SerializeFilter) {
        this.serializeFilter = filter;
    }

    public on(event: "pre-op", listener: (op: api.ISequencedObjectMessage, local: boolean) => void): this;
    public on(event: "op", listener: (op: api.ISequencedObjectMessage, local: boolean) => void): this;
    public on(
        event: "valueChanged",
        listener: (changed: IValueChanged, local: boolean, op: api.ISequencedObjectMessage) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    protected readyContent(): Promise<void> {
        return Promise.resolve();
    }

    protected onDisconnect() {
        debug(`Map ${this.id} is now disconnected`);
        this.onDisconnectContent();
    }

    protected onConnect(pending: api.IObjectMessage[]) {
        debug(`Map ${this.id} is now connected`);

        // Filter the nonAck and pending mesages into a map set and a content set.
        const mapMessages: api.IObjectMessage[] = [];
        const contentMessages: api.IObjectMessage[] = [];
        for (const message of pending) {
            if (this.isMapMessage(message)) {
                mapMessages.push(message);
            } else {
                contentMessages.push(message);
            }
        }

        // Deal with the map messages - for the map it's always last one wins so we just resend
        for (const message of mapMessages) {
            this.submitLocalMessage(message.contents);
        }

        // Allow content to catch up
        this.onConnectContent(contentMessages);
    }

    protected async loadCore(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: api.ISequencedObjectMessage[],
        headerOrigin: string,
        storage: api.IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : {};
        await this.view.populate(data);

        const contentMessages = messages.filter((message) => !this.messageHandler.has(message.contents.type));

        const contentStorage = new ContentObjectStorage(storage);
        await this.loadContent(
            sequenceNumber,
            minimumSequenceNumber,
            contentMessages,
            headerOrigin,
            contentStorage);
    }

    protected initializeLocalCore() {
        this.initializeContent();
    }

    protected processMinSequenceNumberChanged(value: number) {
        this.processMinSequenceNumberChangedContent(value);
    }

    protected async loadContent(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: api.ISequencedObjectMessage[],
        headerOrigin: string,
        services: api.IObjectStorageService): Promise<void> {
        return;
    }

    protected initializeContent() {
        return;
    }

    protected prepareCore(message: api.ISequencedObjectMessage): Promise<any> {
        if (message.type === api.OperationType) {
            const local = message.clientId === this.document.clientId;
            const op: IMapOperation = message.contents;
            if (this.messageHandler.has(op.type)) {
                return this.messageHandler.get(op.type).prepare(op, local, message);
            }
        }

        return this.prepareContent(message);
    }

    protected processCore(message: api.ISequencedObjectMessage, context: any) {
        let handled = false;
        if (message.type === api.OperationType) {
            const local = message.clientId === this.document.clientId;
            const op: IMapOperation = message.contents;
            if (this.messageHandler.has(op.type)) {
                this.messageHandler.get(op.type).process(op, context, local, message);
                handled = true;
            }
        }

        if (!handled) {
            this.processContent(message, context);
        }
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
     * Message sent to notify derived content of disconnection
     */
    protected onDisconnectContent() {
        return;
    }

    /**
     * Message sent upon reconnecting to the delta stream
     */
    protected onConnectContent(pending: api.IObjectMessage[]) {
        for (const message of pending) {
            this.submitLocalMessage(message.contents);
        }

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

    private isMapMessage(message: api.IObjectMessage): boolean {
        const type = message.contents.type;
        return this.messageHandler.has(type);
    }
}
