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
} from "@prague/container-definitions";
import { SharedMap } from "@prague/map";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { BaseStream } from "./baseStream";
import { InkStreamExtension } from "./extension";
import { IDelta, IInkLayer, IStream } from "./interfaces";
import { ISnapshot, Snapshot } from "./snapshot";

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = "header";

/**
 * An empty ISnapshot (used for initializing to empty).
 */
const emptySnapshot: ISnapshot = { layers: [], layerIndex: {} };

/**
 * Inking data structure.
 */
export class InkStream extends BaseStream implements IStream {
    /**
     * Create a new shared stream
     *
     * @param runtime - component runtime the new shared stream belongs to
     * @param id - optional name of the shared stream
     * @returns newly create shared stream (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(SharedMap.getIdForCreate(id), InkStreamExtension.Type) as InkStream;
    }

    /**
     * Get a factory for SharedStream to register with the component.
     *
     * @returns a factory that creates and load SharedStream
     */
    public static getFactory() {
        return new InkStreamExtension();
    }

    /**
     * The current ink snapshot.
     */
    private inkSnapshot: Snapshot;

    /**
     * Create a new Stream.
     *
     * @param runtime - The runtime the Stream will attach to
     * @param id - UUID for the stream
     */
    constructor(runtime: IComponentRuntime, id: string) {
        super(runtime, id, InkStreamExtension.Type);
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

    protected async loadContent(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService,
    ): Promise<void> {
        const header = storage ? await storage.read(snapshotFileName) : undefined;
        const data: ISnapshot = header
            ? JSON.parse(Buffer.from(header, "base64").toString("utf-8"))
            : emptySnapshot;

        this.inkSnapshot = Snapshot.clone(data);
    }

    /**
     * Initialize with an empty ink snapshot
     */
    protected initializeLocalCore() {
        this.inkSnapshot = Snapshot.clone(emptySnapshot);
    }

    /**
     * Derived
     */
    protected snapshotContent(): ITree {
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
     * Apply a delta to the snapshot.
     *
     * @param message - The message containing the delta to apply
     * @param local - Whether the message is local
     */
    protected processContent(message: ISequencedDocumentMessage, local: boolean) {
        // TODO need a derived message for this
        if (message.type === MessageType.Operation && !local) {
            this.inkSnapshot.apply(message.contents as IDelta);
        }
    }
}
