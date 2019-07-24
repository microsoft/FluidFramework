/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeLoader, IRuntimeFactory } from "@prague/container-definitions";

/**
 * Implementation of the code loader for the local-test-server.  This expects that
 * an array of keys to runtime factories will be provided at construction time, which can
 * then be loaded by providing the key as the load source.
 */
export class TestLoader implements ICodeLoader {
    private readonly typeToFactory: Map<string, Promise<IRuntimeFactory> | IRuntimeFactory>;

    /**
     * @param factories - array of keys and their runtime factories for getting code
     */
    constructor(factories: ReadonlyArray<[string, Promise<IRuntimeFactory> | IRuntimeFactory]>) {
        this.typeToFactory = new Map(factories);
    }

    /**
     * Loads code by fetching it from the map it this was constructed with.
     * Returns an IRuntimeFactory which should provide the code, or throws an error
     * if the key does not exist.
     * @param source - key of code to load
     */
    public load<T>(source: string): Promise<T> {
        const factory = this.typeToFactory.get(source);

        if (factory === undefined) {
            throw new Error(`TestLoader: Missing IChainCodeFactory for '${source}'.`);
        }

        return Promise.resolve(factory as any);
    }
}
