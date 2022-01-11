/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { Container, ContainerRecord } from "@fluidframework/container-loader";
import { debug } from "./debug";
import { IOpProcessingController } from "./testObjectProvider";

const debugWait = debug.extend("wait");

interface ContainerLoaderRecord {
    // A short number for debug output
    index: number;

    // LoaderContainerTracker paused state
    containerRecord: ContainerRecord;
}

export class LoaderContainerTracker implements IOpProcessingController {
    private readonly containers = new Map<Container, ContainerLoaderRecord>();
    private lastProposalSeqNum: number = 0;

    /**
     * Add a loader to start to track any container created from them
     * @param loader - loader to start tracking any container created.
     */
    public add<LoaderType extends IHostLoader>(loader: LoaderType) {
        // TODO: Expose Loader API to able to intercept container creation (See issue #5114)
        const patch = <T, C extends IContainer>(fn: (...args) => Promise<C>) => {
            const boundFn = fn.bind(loader);
            return async (...args: T[]) => {
                const container = await boundFn(...args);
                this.addContainer(container as unknown as Container);
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
     * Utility function to add container to be tracked.
     *
     * @param container - container to add
     */
    private addContainer(container: Container) {
        // don't add container that is already tracked
        if (
            this.containers.has(container)
            || container.containerTracker === undefined
            || container.containerTracker.containerRecord === undefined)
            { return; }

        const record = {
            index: this.containers.size,
            containerRecord: container.containerTracker?.containerRecord,
        };
        this.containers.set(container, record);
        this.trackLastProposal(container);
    }

    private trackLastProposal(container: IContainer) {
        container.getQuorum().on("addProposal", (proposal) => {
            if (proposal.sequenceNumber > this.lastProposalSeqNum) {
                this.lastProposalSeqNum = proposal.sequenceNumber;
            }
        });
    }

    /**
     * Reset the tracker, closing all containers and stop tracking them.
     */
    public reset() {
        this.lastProposalSeqNum = 0;
        for (const container of this.containers.keys()) {
            container.containerTracker?.reset();
        }
        this.containers.clear();

        // REVIEW: do we need to unpatch the loaders?
    }

    /**
     * Make sure all the tracked containers are synchronized.
     * - No isDirty (non-readonly) containers
     * - No extra clientId in quorum of any container that is not tracked and still opened.
     *      - i.e. no pending Join/Leave message.
     * - No unresolved proposal (minSeqNum \>= lastProposalSeqNum)
     * - lastSequenceNumber of all container is the same
     * - clientSequenceNumberObserved is the same as clientSequenceNumber sent
     *      - this overlaps with !isDirty, but include task scheduler ops.
     *      - Trailing NoOp is tracked and don't count as pending ops.
     */
    public async ensureSynchronized(...containers: IContainer[]) {
        const resumed = this.resumeProcessing(...containers);

        let waitingSequenceNumberSynchronized = false;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const containersToApply = this.getContainers(containers);
            if (containersToApply.length === 0) { break; }

            // Ignore readonly dirty containers, because it can't sent up and nothing can be done about it being dirty
            const dirtyContainers =
                containersToApply.filter((c) => c.deltaManager.readOnlyInfo.readonly !== true && c.isDirty);
            if (dirtyContainers.length === 0) {
                // Wait for all the leave messages
                const pendingClients = this.getPendingClients(containersToApply);
                if (pendingClients.length === 0) {
                    if (this.isSequenceNumberSynchronized(containersToApply)) {
                        // done, we are in sync
                        break;
                    }
                    if (!waitingSequenceNumberSynchronized) {
                        // Only write it out once
                        waitingSequenceNumberSynchronized = true;
                        debugWait("Waiting for sequence number synchronized");
                        await this.waitForAnyInboundOps(containersToApply);
                    }
                } else {
                    waitingSequenceNumberSynchronized = false;
                    await this.waitForPendingClients(pendingClients);
                }
            } else {
                // Wait for all the containers to be saved
                debugWait(
                    `Waiting container to be saved ${dirtyContainers
                        .map((c)=> this.containers.get(c as Container)?.index)}`);
                waitingSequenceNumberSynchronized = false;
                await Promise.all(dirtyContainers.map(async (c) => new Promise((res) => c.once("saved", res))));
            }

            // yield a turn to allow side effect of the ops we just processed execute before we check again
            await new Promise<void>((res) => { setTimeout(res, 0); });
        }

        // Pause all container that was resumed
        // don't call pause if resumed is empty and pause everything, which is not what we want
        if (resumed.length !== 0) {
            await this.pauseProcessing(...resumed as Container[]);
        }

        debugWait("Synchronized");
    }

    /**
     * Utility to calculate the set of clientId per container in quorum that is NOT associated with
     * any container we tracked, indicating there is a pending join or leave op that we need to wait.
     *
     * @param containersToApply - the set of containers to check
     */
    private getPendingClients(containersToApply: IContainer[]) {
        // All the clientId we track should be a superset of the quorum, otherwise, we are missing
        // leave messages
        const openedDocuments = Array.from(this.containers.keys()).filter((c) => !c.closed);
        const openedClientId = openedDocuments.map((container) => container.clientId);

        const pendingClients: [IContainer, Set<string>][] = [];
        containersToApply.forEach((container) => {
            const pendingClientId = new Set<string>();
            const quorum = container.getQuorum();
            quorum.getMembers().forEach((client, clientId) => {
                // ignore summarizer
                if (!client.client.details.capabilities.interactive) { return; }
                if (!openedClientId.includes(clientId)) {
                    pendingClientId.add(clientId);
                }
            });

            if (pendingClientId.size !== 0) {
                pendingClients.push([container, pendingClientId]);
            }
        });
        return pendingClients;
    }

    /**
     * Utility to check synchronization based on sequence number
     * See ensureSynchronized for more detail
     *
     * @param containersToApply - the set of containers to check
     */
    private isSequenceNumberSynchronized(containersToApply: IContainer[]) {
        // clientSequenceNumber check detects ops in flight, both on the wire and in the outbound queue
        // We need both client sequence number and isDirty check because:
        // - Currently isDirty flag ignores ops for task scheduler, so we need the client sequence number check
        // - But isDirty flags include ops during forceReadonly and disconnected, because we don't submit
        //   the ops in the first place, clientSequenceNumber is not assigned

        const isClientSequenceNumberSynchronized = containersToApply.every((container) => {
            if (container.readOnlyInfo.readonly === true) {
                // Ignore readonly container. the clientSeqNum and clientSeqNumObserved might be out of sync
                // because we transition to readonly when outbound is not empty or the in transit op got lost
                return true;
            }
            // Note that in read only mode, the op won't be submitted
            let deltaManager = (container.deltaManager as any);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const { trailingNoOps } = this.containers.get(container as Container)!.containerRecord;
            // Back-compat: clientSequenceNumber & clientSequenceNumberObserved moved to ConnectionManager in 0.53
            if (!("clientSequenceNumber" in deltaManager)) {
                deltaManager = deltaManager.connectionManager;
            }
            assert("clientSequenceNumber" in deltaManager, "no clientSequenceNumber");
            assert("clientSequenceNumberObserved" in deltaManager, "no clientSequenceNumber");
            return deltaManager.clientSequenceNumber ===
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                (deltaManager.clientSequenceNumberObserved as number) + trailingNoOps;
        });

        if (!isClientSequenceNumberSynchronized) {
            return false;
        }

        const minSeqNum = containersToApply[0].deltaManager.minimumSequenceNumber;
        if (minSeqNum < this.lastProposalSeqNum) {
            // There is an unresolved proposal
            return false;
        }

        // Check to see if all the container has process the same number of ops.
        const seqNum = containersToApply[0].deltaManager.lastSequenceNumber;
        return containersToApply.every((c) => c.deltaManager.lastSequenceNumber === seqNum);
    }

    /**
     * Utility to wait for any clientId in quorum that is NOT associated with any container we
     * tracked, indicating there is a pending join or leave op that we need to wait.
     *
     * Note that this function doesn't account for container that got added after we started waiting
     *
     * @param containersToApply - the set of containers to wait for any inbound ops for
     */
    private async waitForPendingClients(pendingClients: [IContainer, Set<string>][]) {
        const unconnectedClients =
            Array.from(this.containers.keys()).filter((c) => !c.closed && !(c).connected);
        return Promise.all(pendingClients.map(async ([container, pendingClientId]) => {
            return new Promise<void>((res) => {
                const cleanup = () => {
                    unconnectedClients.forEach((c) => c.off("connected", handler));
                    container.getQuorum().off("removeMember", handler);
                };
                const handler = (clientId: string) => {
                    pendingClientId.delete(clientId);
                    if (pendingClientId.size === 0) {
                        cleanup();
                        res();
                    }
                };
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const index = this.containers.get(container as Container)!.index;
                debugWait(`${index}: Waiting for pending clients ${Array.from(pendingClientId.keys())}`);
                unconnectedClients.forEach((c) => c.on("connected", handler));
                container.getQuorum().on("removeMember", handler);
                container.on("closed", () => {
                    cleanup();
                    res();
                });
            });
        }));
    }

    /**
     * Utility to wait for any inbound ops from a set of containers
     * @param containersToApply - the set of containers to wait for any inbound ops for
     */
    private async waitForAnyInboundOps(containersToApply: IContainer[]) {
        const promises: (Promise<void> | undefined)[] = [];
        containersToApply.forEach(
            (container) => promises.push(
                (container as Container).containerTracker?.waitForAnyInboundOps(),
            ),
        );
        await Promise.all(promises);
    }

    /**
     * Resume all queue activities on all paused tracked containers and return them
     */
    public resumeProcessing(...containers: IContainer[]) {
        const resumed: IContainer[] = [];
        containers.forEach((container: IContainer) => {
            const resumedContainer = (container as Container).containerTracker?.resumeProcessing();
            if (resumedContainer !== undefined) { resumed.push(resumedContainer); }
        });
        return resumed;
    }

    /**
     * Pause all queue activities on the containers given, or all tracked containers
     * Any containers given that is not tracked will be ignored.
     */
    public async pauseProcessing(...containers: IContainer[]) {
        const pauseP: Promise<void>[] = [];
        const containersToApply = this.getContainers(containers);
        for (const container of containersToApply) {
            if ((container as Container).containerTracker !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                pauseP.push((container as Container).containerTracker!.pauseProcessing());
            }
        }
        await Promise.all(pauseP);
    }

    /**
     * Pause all queue activities on all tracked containers, and resume only
     * inbound to process ops until it is idle. All queues are left in the paused state
     * after the function
     */
    public async processIncoming(...containers: IContainer[]) {
        const incomingP: Promise<void>[] = [];
        (containers as Container[]).forEach((container) => {
            if (container.containerTracker !== undefined) {
                incomingP.push(container.containerTracker.processIncoming());
            }
        });
        await Promise.all(incomingP);
    }

    /**
     * Pause all queue activities on all tracked containers, and resume only
     * outbound to process ops until it is idle. All queues are left in the paused state
     * after the function
     */
    public async processOutgoing(...containers: IContainer[]) {
        const outgoingP: Promise<void>[] = [];
        (containers as Container[]).forEach((container) => {
            if (container.containerTracker !== undefined) {
                outgoingP.push(container.containerTracker.processIncoming());
            }
        });
        await Promise.all(outgoingP);
    }

    /**
     * Filter out the opened containers based on param.
     * @param containers - The container to filter to.  If the array is empty, it means don't filter and return
     * all open containers.
     */
    private getContainers(containers: IContainer[]) {
        const containersToApply = containers.length === 0 ? Array.from(this.containers.keys()) : containers;
        return containersToApply.filter((container) => !container.closed);
    }
}
