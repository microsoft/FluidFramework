/* tslint:disable:no-unsafe-any*/
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import { IMapOperation, ISharedMap, IValueChanged, IValueOperation, IValueType, MapView, SerializeFilter, SharedMap } from "@prague/map";
import {
    IObjectStorageService,
    IRuntime,
} from "@prague/runtime-definitions";
import { debug } from "./debug";
import { OwnedMapExtension } from "./extension";
import { OwnedSharedObject } from "./ownedSharedObject";

const snapshotFileName = "header";
const ownerPath = "owner";
const contentPath = "content";

class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public read(path: string): Promise<string> {
        return this.storage.read(`content/${path}`);
    }
}

interface IMapMessageHandler {
    prepare(op: IMapOperation, local: boolean, message: ISequencedDocumentMessage): Promise<any>;
    process(op: IMapOperation, context: any, local: boolean, message: ISequencedDocumentMessage): void;
    submit(op: IMapOperation);
}

/**
 * Implementation of a map shared object
 */
export class OwnedSharedMap extends OwnedSharedObject implements ISharedMap {
    public [Symbol.toStringTag]: string;
    protected readonly messageHandler: Map<string, IMapMessageHandler>;
    protected view: MapView;
    protected readonly pendingKeys: Map<string, number>;
    protected pendingClearClientSequenceNumber: number;
    private serializeFilter: SerializeFilter;
    private readonly valueTypes = new Map<string, IValueType<any>>();

    /**
     * Constructs a new shared map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        runtime: IRuntime,
        type = OwnedMapExtension.Type) {

        super(id, runtime, type);
        this.serializeFilter = (key, value, valueType) => value;

        this.messageHandler = new Map<string, IMapMessageHandler>();
        this.pendingKeys = new Map<string, number>();
        this.pendingClearClientSequenceNumber = -1;

        this.setMessageHandlers();
        this.initializeView();
        this[Symbol.toStringTag] = this.view.data[Symbol.toStringTag];
    }

    public getOwner() {
        return this.owner;
    }

    public internalView() {
        return this.view;
    }

    public keys() {
        return this.view.keys();
    }

    // TODO: entries and values will have incorrect content until
    // map contains plain values and meta-data is segregated into
    // separate map
    public entries() {
        return this.view.data.entries();
    }

    public values() {
        return this.view.data.values();
    }

    public [Symbol.iterator]() {
        return this.view.data[Symbol.iterator]();
    }

    public get size() {
        return this.view.data.size;
    }

    public forEach(callbackFn: (value: any, key: any, map: Map<string, any>) => void) {
        this.view.forEach(callbackFn);
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get(key: string) {
        return this.view.get(key);
    }

    public async wait<T>(key: string): Promise<T> {
        return this.view.wait<T>(key);
    }

    public has(key: string) {
        return this.view.has(key);
    }

    public set<T>(key: string, value: any, type?: string): this {
        this.view.set(key, value, type);
        return this;
    }

    public delete(key: string): boolean {
        return this.view.delete(key);
    }

    public clear() {
        return this.view.clear();
    }

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.view.serialize(this.serializeFilter),
                        encoding: "utf-8",
                    },
                },
            ],
            sha: null,
        };

        // Move this to ownedSharedObject
        if (this.getOwner()) {
            tree.entries.push({

                mode: FileMode.File,
                path: ownerPath,
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: this.getOwner(),
                    encoding: "unclear",
                },
            });
        }

        // Add the snapshot of the content to the tree
        const contentSnapshot = this.snapshotContent();
        if (contentSnapshot) {
            tree.entries.push({
                mode: FileMode.Directory,
                path: contentPath,
                type: TreeEntry[TreeEntry.Tree],
                value: contentSnapshot,
            });
        }

        return tree;
    }

    public submitMapClearMessage(op: IMapOperation): void {
        const clientSequenceNumber = this.submitMapMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingClearClientSequenceNumber = clientSequenceNumber;
        }
    }

    public submitMapKeyMessage(op: IMapOperation): void {
        const clientSequenceNumber = this.submitMapMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingKeys.set(op.key, clientSequenceNumber);
        }
    }

    public submitMapMessage(op: IMapOperation): number {
        // Local operations do not require any extra processing
        if (this.isLocal()) {
            return -1;
        }

        // Once we have performed the attach submit the local operation
        return this.submitLocalMessage(op);
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

            submit: (op) => {
                this.submitLocalMessage(op);
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

    public on(event: "pre-op" | "op", listener: (op: ISequencedDocumentMessage, local: boolean) => void): this;
    public on(
        event: "valueChanged",
        listener: (changed: IValueChanged, local: boolean, op: ISequencedDocumentMessage) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    protected onDisconnect() {
        debug(`Map ${this.id} is now disconnected`);
        this.onDisconnectContent();
    }

    protected onConnect(pending: any[]) {
        debug(`Map ${this.id} is now connected`);
        // REVIEW: Does it matter that the map and content message get out of order?

        // Filter the nonAck and pending messages into a map set and a content set.
        const mapMessages: IMapOperation[] = [];
        const contentMessages: any[] = [];
        for (const message of pending) {
            if (this.isMapMessage(message)) {
                mapMessages.push(message);
            } else {
                contentMessages.push(message);
            }
        }

        // Deal with the map messages - for the map it's always last one wins so we just resend
        for (const message of mapMessages) {
            const handler = this.messageHandler.get(message.type);
            handler.submit(message);
        }

        // Allow content to catch up
        this.onConnectContent(contentMessages);
    }

    protected async loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data = header ? JSON.parse(Buffer.from(header, "base64")
            .toString("utf-8")) : {};
        await this.view.populate(data);

        const contentStorage = new ContentObjectStorage(storage);
        await this.loadContent(
            minimumSequenceNumber,
            headerOrigin,
            contentStorage);
    }

    protected initializeLocalCore() {
        this.initializeContent();
    }

    protected async loadContent(
        minimumSequenceNumber: number,
        headerOrigin: string,
        services: IObjectStorageService): Promise<void> {
        return;
    }

    protected initializeContent() {
        return;
    }

    protected prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (message.type === MessageType.Operation) {
            const op: IMapOperation = message.contents;
            if (this.messageHandler.has(op.type)) {
                return this.messageHandler.get(op.type)
                    .prepare(op, local, message);
            }
        }

        return this.prepareContent(message, local);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        let handled = false;
        if (message.type === MessageType.Operation) {
            const op: IMapOperation = message.contents;
            if (this.messageHandler.has(op.type)) {
                this.messageHandler.get(op.type)
                    .process(op, context, local, message);
                handled = true;
            }
        }

        if (!handled) {
            this.processContent(message, local, context);
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

    protected async prepareContent(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return Promise.resolve();
    }

    /**
     * Processes a content message
     */
    protected processContent(message: ISequencedDocumentMessage, local: boolean, context: any) {
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
    protected onConnectContent(pending: any[]) {
        for (const message of pending) {
            this.submitLocalMessage(message);
        }

        return;
    }

    /**
     * Snapshots the content
     */
    protected snapshotContent(): ITree {
        return null;
    }

    protected needProcessKeyOperations(op: IMapOperation, local: boolean, message: ISequencedDocumentMessage): boolean {
        if (this.pendingClearClientSequenceNumber !== -1) {
            // If I have a NACK clear, we can ignore all ops.
            return false;
        }

        if ((this.pendingKeys.size !== 0 && this.pendingKeys.has(op.key))) {
            // Found an NACK op, clear it from the map if the latest sequence number in the map match the message's
            // and don't process the op.
            if (local) {
                const pendingKeyClientSequenceNumber = this.pendingKeys.get(op.key);
                if (pendingKeyClientSequenceNumber === message.clientSequenceNumber) {
                    this.pendingKeys.delete(op.key);
                }
            }
            return false;
        }

        // If we don't have a NACK op on the key, we need to process the remote ops.
        return !local;

    }

    protected initializeView() {
        this.view = new MapView(
            this as unknown as SharedMap,
            this.runtime,
            this.id);
    }

    protected setMessageHandlers() {
        const defaultPrepare = (op: IMapOperation, local: boolean) => Promise.resolve();
        // tslint:disable:no-backbone-get-set-outside-model
        this.messageHandler.set(
            "clear",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    if (local) {
                        if (this.pendingClearClientSequenceNumber === message.clientSequenceNumber) {
                            this.pendingClearClientSequenceNumber = -1;
                        }
                        return false;
                    }
                    if (this.pendingKeys.size !== 0) {
                        this.view.clearExceptPendingKeys(this.pendingKeys);
                        return;
                    }
                    this.view.clearCore(local, message);
                },
                submit: (op) => {
                    this.submitMapClearMessage(op);
                },
            });
        this.messageHandler.set(
            "delete",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }
                    return this.view.deleteCore(op.key, local, message);
                },
                submit: (op) => {
                    this.submitMapKeyMessage(op);
                },
            });
        this.messageHandler.set(
            "set",
            {
                prepare: (op, local) => {
                    return local ? Promise.resolve(null) : this.view.prepareSetCore(op.key, op.value);
                },
                process: (op, context, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }
                    this.view.setCore(op.key, context, local, message);
                },
                submit: (op) => {
                    this.submitMapKeyMessage(op);
                },
            });
    }

    private isMapMessage(message: any): boolean {
        const type = message.type;
        return this.messageHandler.has(type);
    }

}
