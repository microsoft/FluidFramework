/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContentObjectStorage, IMapDataObject, IMapOperation, IValueType, MapKernal } from "@prague/map";
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
 * A distributed data structure that stores intervals
 */
export class SharedIntervalCollection<TInterval extends ISerializableInterval = Interval> extends SharedObject {

    public readonly [Symbol.toStringTag]: string = "SharedIntervalCollection";
    protected readonly intervalMapkernal: MapKernal;

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
        this.intervalMapkernal = new MapKernal(
            runtime,
            this.handle,
            (op) => this.submitLocalMessage(op),
            [valueType],
        );
    }

    public async waitSharedIntervalCollection(
        label: string,
    ): Promise<IntervalCollection<TInterval>> {
        return this.intervalMapkernal.wait<IntervalCollection<TInterval>>(label);
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getIntervalCollection(label: string): IntervalCollection<TInterval> {
        if (!this.intervalMapkernal.has(label)) {
            this.intervalMapkernal.set(
                label,
                undefined,
                this.valueType.name);
        }

        const sharedCollection =
            this.intervalMapkernal.get<IntervalCollection<TInterval>>(label);
        return sharedCollection;
    }

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.intervalMapkernal.serialize(),
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

    public serialize() {
        return this.intervalMapkernal.serialize();
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
            if (this.intervalMapkernal.hasHandlerFor(message)) {
                mapMessages.push(message);
            } else {
                contentMessages.push(message);
            }
        }

        // Deal with the map messages - for the map it's always last one wins so we just resend
        for (const message of mapMessages) {
            const handler = this.intervalMapkernal.messageHandlers.get(message.type);
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
        this.intervalMapkernal.populate(data as IMapDataObject);

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
            if (this.intervalMapkernal.messageHandlers.has(op.type)) {
                this.intervalMapkernal.messageHandlers.get(op.type)
                    .process(op, local, message);
                handled = true;
            }
        }

        if (!handled) {
            this.processContent(message, local);
        }
    }

    protected registerCore() {
        for (const value of this.intervalMapkernal.values()) {
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
}
