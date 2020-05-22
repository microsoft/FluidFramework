/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IComponentContext,
    IComponentFactory,
} from "@fluidframework/runtime-definitions";
import { LazyPromise } from "@fluidframework/common-utils";

export class LazyComponentFactory implements IComponentFactory {
    private readonly factoryP: Promise<IComponentFactory>;

    constructor(
        public readonly type: string,
        fetch: () => Promise<IComponentFactory>,
    ) {
        this.factoryP = new LazyPromise(fetch);
    }

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        this.factoryP.then((factory) => {
            assert.equal(factory.type, this.type);

            return factory.instantiateComponent(context);
        }).catch((error) => context.error(error));
    }
}
