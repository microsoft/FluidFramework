/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoader, IContainer } from "@fluidframework/container-definitions";

export class LoaderContainerTracker {
    private readonly containers = new Set<IContainer>();

    public add<LoaderType extends ILoader>(loader: LoaderType) {
        const patch = <T, C extends IContainer>(fn: (...args: T[]) => Promise<C>) => {
            const boundFn = fn.bind(loader);
            return async (...args: T[]) => {
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

    public async ensureSynchronized() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const containers = Array.from(this.containers.values());
            const openedContainers = containers.filter((c) => !c.closed);
            if (openedContainers.length === 0) { return; }

            const dirtyContainers = openedContainers.filter((c) => c.isDirty);
            if (dirtyContainers.length !== 0) {
                await Promise.all(dirtyContainers.map(async (c) => new Promise((res) => c.once("saved", res))));
                // Loop back and check again if we are dirty.
                continue;
            }
            // Check to see if all the container has process the same number of ops.
            const seqNum = openedContainers[0].deltaManager.lastSequenceNumber;
            if (openedContainers.every((c) => c.deltaManager.lastSequenceNumber === seqNum)) {
                // done, we are in sync
                return;
            }
            // yield
            await new Promise<void>((res) => {
                setTimeout(res, 0);
            });
        }
    }
}
