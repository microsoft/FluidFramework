/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeLoader, IFluidCodeDetails, IRuntimeFactory } from "@microsoft/fluid-container-definitions";

/**
 * Implementation of the code loader for the local-test-server.  This expects that
 * an array of keys to runtime factories will be provided at construction time, which can
 * then be loaded by providing the key as the load source.
 */
export class TestCodeLoader implements ICodeLoader {
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
    public load<T>(pkg: IFluidCodeDetails): Promise<T> {
        let source: string;
        console.log(pkg);
        console.log(JSON.stringify(pkg));
        console.log(JSON.stringify(this.typeToFactory.keys));
        if (typeof pkg.package === "string") {
            source = pkg.package;
        } else {
            source = `${pkg.package.name}@${pkg.package.version}`;
        }
        const factory = this.typeToFactory.get(source);

        if (factory === undefined) {
            throw new Error(`TestCodeLoader: Missing IRuntimeFactory for '${source}'.`);
        }

        return Promise.resolve(factory as any);
    }
}
