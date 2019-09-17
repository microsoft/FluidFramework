/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMapDataObject, IMapOperation, IValueChanged, IValueType, MapKernal } from "@prague/map";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@prague/runtime-definitions";
import {
    ISharedObjectFactory,
    SharedObject,
} from "@prague/shared-object-common";
import { fromBase64ToUtf8 } from "@prague/utils";
import { debug } from "./debug";
import {
    Interval,
    IntervalCollection,
    IntervalCollectionValueType,
    ISerializableInterval,
 } from "./intervalCollection";
import { pkgVersion } from "./packageVersion";

const snapshotFileName = "header";
const contentPath = "content";

class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public read(path: string): Promise<string> {
        return this.storage.read(`${contentPath}/${path}`);
    }
}

export const intervalCollectionMapPath = "intervalCollections/";

function getIntervalCollectionPath(label: string): string {
    return `${intervalCollectionMapPath}${label}`;
}

/**
 * The factory that defines the map
 */
export class SharedIntervalCollectionFactory implements ISharedObjectFactory {
    public static readonly Type = "https://graph.microsoft.com/types/sharedIntervalCollection";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedIntervalCollectionFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedIntervalCollectionFactory.Type;
    }

    public get attributes() {
        return SharedIntervalCollectionFactory.Attributes;
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<SharedIntervalCollection> {

        const map = new SharedIntervalCollection(id, runtime, this.attributes, new IntervalCollectionValueType());
        await map.load(branchId, services);

        return map;
    }

    public create(runtime: IComponentRuntime, id: string): SharedIntervalCollection {
        const map = new SharedIntervalCollection(
            id,
            runtime,
            this.attributes,
            new IntervalCollectionValueType());
        map.initializeLocal();

        return map;
    }
}

/**
 * A SharedMap is a map-like distributed data structure.
 */
export class SharedIntervalCollection<TInterval extends ISerializableInterval = Interval> extends SharedObject {

    public readonly [Symbol.toStringTag]: string = "SharedIntervalCollection";
    protected readonly kernal: MapKernal;

    /**
     * Constructs a new shared map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        runtime: IComponentRuntime,
        attributes = SharedIntervalCollectionFactory.Attributes,
        private readonly valueType: IValueType<IntervalCollection<TInterval>>,
    ) {
        super(id, runtime, attributes);
        this.kernal = new MapKernal(
            runtime,
            this.handle,
            (op) => this.submitLocalMessage(op),
            [valueType],
        );
    }

    public getIntervalCollection(key: string): IntervalCollection<TInterval> {
        return this.kernal.get<IntervalCollection<TInterval>>(key);
    }
    public createIntervalCollection(key: string) {
        this.kernal.set(key, undefined, this.valueType.name);
    }

    public async waitSharedIntervalCollection(
        label: string,
    ): Promise<IntervalCollection<TInterval>> {
        const translatedLabel = getIntervalCollectionPath(label);
        return this.kernal.wait<IntervalCollection<TInterval>>(translatedLabel);
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getSharedIntervalCollection(label: string): IntervalCollection<TInterval> {
        return this.getSharedIntervalCollectionInternal(
            label);
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getGenericSharedIntervalCollection(
        label: string,
    ): IntervalCollection<TInterval> {
        return this.getSharedIntervalCollectionInternal(
            label);
    }

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.kernal.serialize(),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

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

    /**
     * Registers a listener on the specified events
     */
    public on(
        event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: this) => void): this;
    public on(event: "valueChanged", listener: (
        changed: IValueChanged,
        local: boolean,
        op: ISequencedDocumentMessage,
        target: this) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public serialize() {
        return this.kernal.serialize();
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
            if (this.kernal.hasHandlerFor(message)) {
                mapMessages.push(message as IMapOperation);
            } else {
                contentMessages.push(message);
            }
        }

        // Deal with the map messages - for the map it's always last one wins so we just resend
        for (const message of mapMessages) {
            const handler = this.kernal.messageHandlers.get(message.type);
            handler.submit(message);
        }

        // Allow content to catch up
        this.onConnectContent(contentMessages);
    }

    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data = header ? JSON.parse(fromBase64ToUtf8(header)) : {};
        this.kernal.populate(data as IMapDataObject);

        const contentStorage = new ContentObjectStorage(storage);
        await this.loadContent(
            branchId,
            contentStorage);
    }

    protected async loadContent(
        branchId: string,
        services: IObjectStorageService): Promise<void> {
        return;
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        let handled = false;
        if (message.type === MessageType.Operation) {
            const op: IMapOperation = message.contents as IMapOperation;
            if (this.kernal.messageHandlers.has(op.type)) {
                this.kernal.messageHandlers.get(op.type)
                    .process(op, local, message);
                handled = true;
            }
        }

        if (!handled) {
            this.processContent(message, local);
        }
    }

    protected registerCore() {
        for (const value of this.kernal.values()) {
            if (SharedObject.is(value)) {
                value.register();
            }
        }

        this.registerContent();
    }

    // The following three methods enable derived classes to provide custom content that is stored
    // with the map

    protected registerContent() {
        return;
    }

    /**
     * Processes a content message
     */
    protected processContent(message: ISequencedDocumentMessage, local: boolean) {
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
     * Allows Sequence to overwrite nap's default behavior
     */
    protected onConnectContent(pending: any[]) {
        super.onConnect(pending);
    }

    /**
     * Snapshots the content
     */
    protected snapshotContent(): ITree {
        return null;
    }

    private getSharedIntervalCollectionInternal(
        label: string,
    ): IntervalCollection<TInterval> {
        const translatedLabel = getIntervalCollectionPath(label);

        if (!this.kernal.has(translatedLabel)) {
            this.kernal.set(
                translatedLabel,
                undefined,
                this.valueType.name);
        }

        const sharedCollection =
        this.kernal.get<IntervalCollection<TInterval>>(translatedLabel);
        return sharedCollection;
    }
}
