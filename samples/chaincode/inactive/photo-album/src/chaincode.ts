/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MapExtension } from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { CollaborativeStringExtension } from "@prague/shared-string";
import { StreamExtension } from "@prague/stream";
import * as assert from "assert";
import { EventEmitter } from "events";

/**
 * A document is a collection of collaborative types.
 */
export class Chaincode extends EventEmitter implements IChaincode {
    private modules = new Map<string, any>();

    /**
     * Constructs a new document from the provided details
     */
    constructor(private runner: any) {
        super();

        this.modules.set(MapExtension.Type, new MapExtension());
        this.modules.set(CollaborativeStringExtension.Type, new CollaborativeStringExtension());
        this.modules.set(StreamExtension.Type, new StreamExtension());
    }

    public getModule(type: string): any {
        assert(this.modules.has(type));
        return this.modules.get(type);
    }

    /**
     * Stops the instantiated chaincode from running
     */
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public async run(runtime: IRuntime, platform: IPlatform): Promise<void> {
        this.runner.run(runtime, platform);
    }
}
