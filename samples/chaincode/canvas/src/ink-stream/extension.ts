/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectExtension } from "@prague/shared-object-common";
import { BaseStream } from "./baseStream";
import { InkStream } from "./inkStream";

/**
 * Factory for Streams.
 */
export class BaseStreamExtension implements ISharedObjectExtension {
    constructor(
        public readonly type: string,
        public readonly snapshotFormatVersion,
        private readonly factory: (runtime: IComponentRuntime, id: string) => BaseStream,
    ) {
    }

    /**
     * Creates a new Stream object and loads it with data from the given services.
     *
     * @param runtime - The ComponentRuntime that this stream will be associated with
     * @param id - Unique ID for the new stream
     * @param minimumSequenceNumber - Not used
     * @param services - Services with the object storage to load from
     * @param headerOrigin - Not used
     */
    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const stream = this.factory(runtime, id);
        await stream.load(minimumSequenceNumber, headerOrigin, services);

        return stream;
    }

    /**
     * Creates a new empty Stream object.
     *
     * @param runtime - The ComponentRuntime that this stream will be associated with
     * @param id - Unique ID for the new stream
     */
    public create(runtime: IComponentRuntime, id: string): ISharedObject {
        const stream = this.factory(runtime, id);
        stream.initializeLocal();

        return stream;
    }
}

/**
 * Factory for Streams.
 */
export class InkStreamExtension extends BaseStreamExtension {
    /**
     * Static type identifier.
     */
    public static Type = "@prague/stream/inkStream";

    constructor() {
        super(InkStreamExtension.Type, "0.1", (runtime, id) => new InkStream(runtime, id));
    }
}
