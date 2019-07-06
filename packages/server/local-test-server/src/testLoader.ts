/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeLoader, IRuntimeFactory } from "@prague/container-definitions";

export class TestLoader implements ICodeLoader {
    private readonly typeToFactory: Map<string, Promise<IRuntimeFactory> | IRuntimeFactory>;

    constructor(factories: ReadonlyArray<[string, Promise<IRuntimeFactory> | IRuntimeFactory]>) {
        this.typeToFactory = new Map(factories);
    }

    public load<T>(source: string): Promise<T> {
        const factory = this.typeToFactory.get(source);

        if (factory === undefined) {
            throw new Error(`TestLoader: Missing IChainCodeFactory for '${source}'.`);
        }

        return Promise.resolve(factory as any);
    }
}
