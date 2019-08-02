/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { SharedObject } from "@prague/shared-object-common";
import { StreamExtension } from "./extension";
import { IDelta, IInkLayer, IStream } from "./interfaces";
import { IInkSnapshot, InkSnapshot } from "./snapshot";

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = "header";

/**
 * An empty ISnapshot (used for initializing to empty).
 */
const emptySnapshot: IInkSnapshot = { layers: [], layerIndex: {} };

/**
 * Inking data structure.
 */
export class Stream extends SharedObject implements IStream {
    /**
     * Create a new shared stream
     *
     * @param runtime - component runtime the new shared stream belongs to
     * @param id - optional name of the shared stream
     * @returns newly create shared stream (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(SharedObject.getIdForCreate(id), StreamExtension.Type) as Stream;
    }

    /**
     * Get a factory for SharedStream to register with the component.
     *
     * @returns a factory that creates and load SharedStream
     */
    public static getFactory() {
        return new StreamExtension();
    }

    /**
     * The current ink snapshot.
     */
    private inkSnapshot: InkSnapshot = InkSnapshot.clone(emptySnapshot);

    /**
     * Create a new Stream.
     *
     * @param runtime - The runtime the Stream will attach to
     * @param id - UUID for the stream
     */
    constructor(runtime: IComponentRuntime, id: string) {
        super(id, runtime, StreamExtension.Type);
    }

    /**
     * Get the ink layers from the snapshot.
     */
    public getLayers(): IInkLayer[] {
        return this.inkSnapshot.layers;
    }

    /**
     * Get a specific layer from the snapshot.
     *
     * @param key - The UUID for the layer
     */
    public getLayer(key: string): IInkLayer {
        return this.inkSnapshot.layers[this.inkSnapshot.layerIndex[key]];
    }

    /**
     * Send the op and apply.
     *
     * @param op - Op to submit
     */
    public submitOp(op: IDelta) {
        this.submitLocalMessage(op);
        this.inkSnapshot.apply(op);
    }

    /**
     * Get a snapshot of the current content as an ITree.
     */
    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.inkSnapshot),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        return tree;
    }

    /**
     * Initialize the stream with a snapshot from the given storage.
     *
     * @param minimumSequenceNumber - Not used
     * @param headerOrigin - Not used
     * @param storage - Storage service to read from
     */
    protected async loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read(snapshotFileName);
        /* tslint:disable:no-unsafe-any */
        const snapshot: IInkSnapshot = header
            ? JSON.parse(Buffer.from(header, "base64")
                .toString("utf-8"))
            : emptySnapshot;
        this.loadInkSnapshot(snapshot);
    }

    /**
     * Initialize an empty stream.
     */
    protected initializeLocalCore() {
        this.loadInkSnapshot(emptySnapshot);
    }

    /**
     * Prepares the given message for processing.  Nothing for Stream
     *
     * @param message - the message to prepare
     * @param local - true if the object is local
     * @returns resolved when message is prepared
     */
    protected async prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return Promise.resolve();
    }

    /**
     * Apply a delta to the snapshot.
     *
     * @param message - The message containing the delta to apply
     * @param local - Whether the message is local
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation && !local) {
            this.inkSnapshot.apply(message.contents as IDelta);
        }
    }

    /**
     * Perform custom processing once an attach has happened.  Nothing for Stream
     */
    protected registerCore() {
        return;
    }

    /**
     * Nothing to do when the object has disconnected from the delta stream
     */
    protected onDisconnect() {
        return;
    }

    /**
     * Initialize the stream with data from an existing snapshot.
     *
     * @param snapshot - The snapshot to initialize from
     */
    private loadInkSnapshot(snapshot: IInkSnapshot) {
        this.inkSnapshot = InkSnapshot.clone(snapshot);
    }
}
