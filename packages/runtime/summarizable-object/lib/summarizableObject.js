/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { FileMode, TreeEntry, } from "@microsoft/fluid-protocol-definitions";
import { SharedObject, } from "@microsoft/fluid-shared-object-base";
import { SummarizableObjectFactory } from "./summarizableObjectFactory";
const snapshotFileName = "header";
/**
 * Implementation of a summarizable object. It does not generate any ops. It is only part of the summary.
 * Data should be set in this object in response to a remote op.
 */
export class SummarizableObject extends SharedObject {
    /**
     * Constructs a new SummarizableObject. If the object is non-local, an id and service interfaces will
     * be provided.
     *
     * @param id - optional name of the summarizable object.
     * @param runtime - component runtime thee object belongs to.
     * @param attributes - The attributes for the object.
     */
    constructor(id, runtime, attributes) {
        super(id, runtime, attributes);
        /**
         * The data held by this object.
         */
        this.data = new Map();
    }
    /**
     * Create a new summarizable object
     *
     * @param runtime - component runtime the new summarizable object belongs to.
     * @param id - optional name of the summarizable object.
     * @returns newly create summarizable object (but not attached yet).
     */
    static create(runtime, id) {
        return runtime.createChannel(id, SummarizableObjectFactory.Type);
    }
    /**
     * Get a factory for SummarizableObject to register with the component.
     *
     * @returns a factory that creates and loads SummarizableObject.
     */
    static getFactory() {
        return new SummarizableObjectFactory();
    }
    /**
     * {@inheritDoc ISummarizableObject.get}
     */
    get(key) {
        return this.data.get(key);
    }
    /**
     * {@inheritDoc ISummarizableObject.set}
     */
    set(key, value) {
        this.data.set(key, value);
        // Set this object as dirty so that it is part of the next summary.
        this.dirty();
    }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.snapshot}
     */
    snapshot() {
        const contentsBlob = {};
        this.data.forEach((value, key) => {
            contentsBlob[key] = value;
        });
        // Construct the tree for the data.
        const tree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(contentsBlob),
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
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.loadCore}
     */
    async loadCore(branchId, storage) {
        const rawContent = await storage.read(snapshotFileName);
        const contents = JSON.parse(fromBase64ToUtf8(rawContent));
        for (const [key, value] of Object.entries(contents)) {
            this.data.set(key, value);
        }
    }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onConnect}
     */
    onConnect(pending) { }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.registerCore}
     */
    registerCore() { }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onDisconnect}
     */
    onDisconnect() { }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.processCore}
     */
    processCore(message, local) {
        throw new Error("Summarizable object should not generate any ops.");
    }
}
//# sourceMappingURL=summarizableObject.js.map