/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoader, IContainer } from "@fluidframework/container-definitions";

export class LoaderContainerTracker {
    private readonly containers = new Set<IContainer>();

    public add<LoaderType extends ILoader>(loader: LoaderType) {
        const patch = <C extends IContainer>(fn: (...args: any[]) => Promise<C>) => {
            const boundFn = fn.bind(loader);
            return async (...args: any[]) => {
                const container = await boundFn(...args);
                this.containers.add(container);
                return container;
            };
        };
        // eslint-disable-next-line @typescript-eslint/unbound-method
        loader.resolve = patch(loader.resolve);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        loader.createDetachedContainer = patch(loader.createDetachedContainer);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        loader.rehydrateDetachedContainerFromSnapshot = patch(loader.rehydrateDetachedContainerFromSnapshot);
    }

    public reset() {
        for (const container of this.containers) {
            container.close();
        }
        this.containers.clear();
    }
}
