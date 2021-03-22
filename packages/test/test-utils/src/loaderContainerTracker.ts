/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IDeltaQueue, IHostLoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { debug } from "./debug";

const debugOp = debug.extend("ops");

export class LoaderContainerTracker {
    private readonly containers = new Map<IContainer, boolean>();

    /**
     * @internal Temporary exposing a list of containers for OpProcessingController shim
     */
    public get trackedContainers() {
        return this.containers.keys();
    }

    /**
     * Add a loader to start to track any container created from them
     * @param loader loader to start tracking any container created.
     */
    public add<LoaderType extends IHostLoader>(loader: LoaderType) {
        // TODO: Expose Loader API to able to intercept container creation
        const patch = <T, C extends IContainer>(fn: (...args) => Promise<C>) => {
            const boundFn = fn.bind(loader);
            return async (...args: T[]) => {
                const container = await boundFn(...args);
                if (!this.containers.has(container)) {
                    this.containers.set(container, false);
                    this.setupTrace(container, this.containers.size);
                }
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

    /**
     * Reset the tracker, closing all containers and stop tracking them.
     */
    public reset() {
        for (const container of this.containers.keys()) {
            container.close();
        }
        this.containers.clear();

        // TODO: Unpatch the loaders?
    }

    /**
     * Make sure all the tracked containers are synchronized.
     * That means all the opened containers
     */
    public async ensureSynchronized() {
        const resumed = this.resumeProcessing();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const containers = Array.from(this.containers.keys());
            const openedContainers = containers.filter((c) => !c.closed);
            if (openedContainers.length === 0) { break; }

            const dirtyContainers = openedContainers.filter((c) => c.isDirty);
            if (dirtyContainers.length !== 0) {
                // Wait for all the containers to be saved
                await Promise.all(dirtyContainers.map(async (c) => new Promise((res) => c.once("saved", res))));
            } else {
                // Wait for all the leave messages
                const pendingDisconnectedClients = this.getPendingDisconnectedClients(openedContainers);
                if (pendingDisconnectedClients.length !== 0) {
                    await this.waitForDisconnectedClients(pendingDisconnectedClients);
                } else if (this.isSequenceNumberSynchronized(openedContainers)) {
                    // done, we are in sync
                    break;
                }
            }
            // yield a turn to allow side effect of the ops we just processed execute before we check again
            await new Promise<void>((res) => { setTimeout(res, 0); });
        }

        // Pause all container that was resumed
        await this.pauseProcessing(resumed);
    }

    private getPendingDisconnectedClients(openedContainers: IContainer[]) {
        // All the clientId we track should be a superset of the quorum, otherwise, we are missing
        // leave messages
        const openedClientId = openedContainers.map((container) => (container as Container).clientId);

        const disconnectClients: [IContainer, Set<string>][] = [];
        openedContainers.forEach((container) => {
            const disconnectedClientId = new Set<string>();
            const quorum = container.getQuorum();
            quorum.getMembers().forEach((client, clientId) => {
                if (!openedClientId.includes(clientId)) {
                    disconnectedClientId.add(clientId);
                }
            });

            if (disconnectedClientId.size !== 0) {
                disconnectClients.push([container, disconnectedClientId]);
            }
        });
        return disconnectClients;
    }

    private async waitForDisconnectedClients(disconnectClients: [IContainer, Set<string>][]) {
        return Promise.all(disconnectClients.map(async ([container, disconnectedClientId]) => {
            return new Promise<void>((res) => {
                const handler = (clientId: string) => {
                    disconnectedClientId.delete(clientId);
                    if (disconnectedClientId.size === 0) {
                        container.getQuorum().off("removeMember", handler);
                        res();
                    }
                };
                container.getQuorum().on("removeMember", handler);
                container.on("closed", () => {
                    container.getQuorum().off("removeMember", handler);
                    res();
                });
            });
        }));
    }

    private isSequenceNumberSynchronized(openedContainers: IContainer[]) {
        // TODO: Currently isDirty flag ignores ops for task scheduler.
        // So we need to look into the deltamanager to use clientSequenceNumber.
        const isClientSequenceNumberSynchronized = openedContainers.every((container) => {
            const deltaManager = (container.deltaManager as any);
            return deltaManager.clientSequenceNumber === deltaManager.clientSequenceNumberObserved;
        });

        if (!isClientSequenceNumberSynchronized) { return false; }

        // Check to see if all the container has process the same number of ops.
        const seqNum = openedContainers[0].deltaManager.lastSequenceNumber;
        return openedContainers.every((c) => c.deltaManager.lastSequenceNumber === seqNum);
    }

    /**
     * Resume all queue activities on all paused tracked containers and return them
     */
    private resumeProcessing() {
        const resumed: IContainer[] = [];
        for (const [container, paused] of this.containers.entries()) {
            if (paused) {
                container.deltaManager.inbound.resume();
                container.deltaManager.outbound.resume();
                resumed.push(container);
                this.containers.set(container, false);
            }
        }
        return resumed;
    }

    /**
     * Pause all queue activities on the containers given, or all tracked containers
     * Any containers given that is not tracked will be ignored.
     */
    public async pauseProcessing(containers?: IContainer[]) {
        const pauseP: Promise<void>[] = [];
        const containersToPause = containers ?? this.containers.keys();
        for (const container of containersToPause) {
            const paused = this.containers.get(container);
            if (paused !== undefined && !paused) {
                pauseP.push(container.deltaManager.inbound.pause());
                pauseP.push(container.deltaManager.outbound.pause());
                this.containers.set(container, true);
            }
        }
        return Promise.all(pauseP);
    }

    /**
     * Pause all queue activities on all tracked containers, and resume only
     * inbound to process ops until it is idle. All queues are left in the paused state
     * after the function
     */
    public async processIncoming() {
        return this.processQueue((container) => container.deltaManager.inbound);
    }

    /**
     * Pause all queue activities on all tracked containers, and resume only
     * outbound to process ops until it is idle. All queues are left in the paused state
     * after the function
     */
    public async processOutgoing() {
        return this.processQueue((container) => container.deltaManager.outbound);
    }

    /**
     * @deprecated Same as ensureSynchronized()
     */
    public async process() {
        return this.ensureSynchronized();
    }

    /**
     * Implementation of processIncoming and processOutgoing
     */
    private async processQueue<U>(getQueue: (container: IContainer) => IDeltaQueue<U>) {
        await this.pauseProcessing();
        const resumed: IDeltaQueue<U>[] = [];
        for (const container of this.containers.keys()) {
            const queue = getQueue(container);
            queue.resume();
            resumed.push(queue);
        }

        while (resumed.some((queue) => !queue.idle)) {
            await new Promise<void>((res) => { setTimeout(res, 0); });
        }

        await Promise.all(resumed.map(async (queue) => queue.pause()));
    }

    /**
     * Setup debug traces for connection and ops
     */
    private setupTrace(container: IContainer, index: number) {
        if (debugOp.enabled) {
            container.deltaManager.outbound.on("op", (messages) => {
                for (const msg of messages) {
                    debugOp(`${index}: OUT:         `
                        + `clientSeq: ${msg.clientSequenceNumber} ${msg.type}`);
                }
            });
            container.deltaManager.inbound.on("push", (msg) => {
                debugOp(`${index}: IN : seq: ${msg.sequenceNumber} `
                    + `clientSeq: ${msg.clientSequenceNumber.toString().padStart(3)} ${msg.type} `);
            });

            container.deltaManager.on("connect", (details) => {
                debugOp(`${index}: CON: clientId: ${details.clientId}`);
            });
            container.deltaManager.on("disconnect", (reason) => {
                debugOp(`${index}: DIS: ${reason}`);
            });
        }
    }
}
