/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, SharedMap } from "@prague/map";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";

/**
 * ID used for the root map.
 */
const rootMapId = "root";

/**
 * A document is a collection of collaborative types.
 */
export class Document {
    /**
     * Get a Document for the given runtime.
     * @param runtime The runtime for the Document
     */
    public static async load(runtime: IComponentRuntime): Promise<Document> {
        let root: ISharedMap;

        if (!runtime.existing) {
            root = SharedMap.create(runtime, rootMapId);
            root.attach();
        } else {
            root = await runtime.getChannel("root") as ISharedMap;
        }

        const document = new Document(runtime, root);

        return document;
    }

    /**
     * Flag indicating whether the document already existed at the time of load.
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    /**
     * Constructs a new document from the provided details
     * @param runtime Runtime for the Document
     * @param root Root map for the Document
     */
    private constructor(public runtime: IComponentRuntime, private root: ISharedMap) {
    }

    /**
     * Get the root map.
     */
    public getRoot(): ISharedMap {
        return this.root;
    }

    /**
     * Create a new map with the given id.
     * @param id ID for the map
     */
    public createMap(id?: string): ISharedMap {
        return SharedMap.create(this.runtime, id);
    }

    /**
     * Create a new shared string with the given id.
     * @param id ID for the shared string
     */
    public createString(id?: string): SharedString {
        return SharedString.create(this.runtime, id);
    }
}
