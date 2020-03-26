/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
} from "@microsoft/fluid-runtime-definitions";
import {
    ISharedObjectFactory,
    SharedObject,
} from "@microsoft/fluid-shared-object-base";
import { ISummarizableObject, SummarizableData } from "./interfaces";
import { SummarizableObjectFactory } from "./summarizableObjectFactory";

const snapshotFileName = "header";

/**
 * Implementation of a summarizable object. It does not generate any ops. It is only part of the summary.
 * Data should be set in this object in response to a remote op.
 */
export class SummarizableObject extends SharedObject implements ISummarizableObject {
    /**
     * Create a new summariable object
     *
     * @param runtime - component runtime the new summarizable object belongs to.
     * @param id - optional name of the summarizable object.
     * @returns newly create summarizable object (but not attached yet).
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, SummarizableObjectFactory.Type) as SummarizableObject;
    }

    /**
     * Get a factory for SummarizableObject to register with the component.
     *
     * @returns a factory that creates and loads SummarizableObject.
     */
    public static getFactory(): ISharedObjectFactory {
        return new SummarizableObjectFactory();
    }

    /**
     * The data held by this object.
     */
    private _data: SummarizableData;

    /**
     * Constructs a new SummarizableObject. If the object is non-local, an id and service interfaces will
     * be provided.
     *
     * @param id - optional name of the summarizable object.
     * @param runtime - component runtime thee object belongs to.
     * @param attributes - The attributes for the object.
     */
    constructor(id: string, runtime: IComponentRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
        this._data = {};
    }

    public get data(): SummarizableData {
        return this._data;
    }
    public set data(data: SummarizableData) {
        if (SharedObject.is(data)) {
            throw new Error("SharedObject sets are no longer supported. Instead set the SharedObject handle.");
        }

        Object.keys(data).forEach(
            (key) => {
                this._data[key] = data[key];
            },
        );

        // Set this object as dirty so that it is part of the next summary.
        this.dirty();
    }

    /**
     * Initialize a local instance of data.
     */
    protected initializeLocalCore() {
        this._data = {};
    }

    /**
     *
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.snapshot}
     *
     * Create a snapshot for the object's data.
     *
     * @returns the snapshot of the current state of the data.
     */
    public snapshot(): ITree {
        // Construct the tree for the data.
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.data),
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    /**
     *
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.loadCore}
     *
     * Load data from snapshot.
     *
     * @param branchId - Not used.
     * @param storage - the storage to get the snapshot from.
     * @returns - promise that resolved when the load is completed.
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService): Promise<void> {

        const rawContent = await storage.read(snapshotFileName);

        this._data = rawContent !== undefined ? JSON.parse(fromBase64ToUtf8(rawContent)) : {};
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onConnect}
     */
    protected onConnect(pending: any[]) {}

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.registerCore}
     */
    protected registerCore() {}

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onDisconnect}
     */
    protected onDisconnect() {}

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.processCore}
     *
     * Process a data operation. Summarizable object should not generate ops.
     * Throw an error if this is called.
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        throw new Error("Summarizable object should not generate any ops.");
    }
}
