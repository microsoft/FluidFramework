/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IDeltaManager } from "@fluidframework/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

// An IDeltaManager alias to be used within this class.
export type DeltaManager = IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

class DeltaManagerToggle {
    private inboundPauseP: Promise<void> | undefined;
    private outboundPauseP: Promise<void> | undefined;
    constructor(public readonly deltaManager: DeltaManager) {
    }

    public async togglePauseAll() {
        return Promise.all([this.togglePauseInbound(), this.togglePauseOutbound()]);
    }

    public toggleResumeAll() {
        this.toggleResumeInbound();
        this.toggleResumeOutbound();
    }
    public async togglePauseInbound() {
        if (!this.inboundPauseP) {
            this.inboundPauseP = this.deltaManager.inbound.pause();
        }
        return this.inboundPauseP;
    }

    public async togglePauseOutbound() {
        if (!this.outboundPauseP) {
            this.outboundPauseP = this.deltaManager.outbound.pause();
        }
        return this.outboundPauseP;
    }

    public toggleResumeInbound() {
        if (this.inboundPauseP) {
            this.inboundPauseP = undefined;
            this.deltaManager.inbound.resume();
        }
    }

    public toggleResumeOutbound() {
        if (this.outboundPauseP) {
            this.outboundPauseP = undefined;
            this.deltaManager.outbound.resume();
        }
    }
}

export interface IDeltaConnectionServerMonitor {
    hasPendingWork(): Promise<boolean>;
}

/**
 * Class with access to the local delta connection server and delta managers that can control op processing.
 */
export class OpProcessingController {
    /**
     * Yields control in the JavaScript event loop.
     */
    public static async yield(): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    private readonly deltaManagerToggles = new Map<DeltaManager, DeltaManagerToggle>();

    private isNormalProcessingPaused = false;

    /*
    * Is processing being deterministically controlled, or are changes allowed to flow freely?
    */
    public get isProcessingControlled(): boolean {
        return this.isNormalProcessingPaused;
    }

    /**
     * @param deltaConnectionServerMonitor - delta connection server monitor to tell whether we have pending work
     */
    public constructor(private readonly deltaConnectionServerMonitor: IDeltaConnectionServerMonitor) { }

    /**
     * Add a collection of delta managers by adding them to the local collection.
     * @param deltaManagers - Array of deltaManagers to add
     */
    public addDeltaManagers(...deltaManagers: DeltaManager[]) {
        deltaManagers.forEach((deltaManager) => {
            this.deltaManagerToggles.set(deltaManager, new DeltaManagerToggle(deltaManager));
        });
    }

    /**
      * Processes incoming and outgoing op) of the given delta managers.
      * It validates the delta managers and resumes its inbound and outbound queues. It then keeps yielding
      * the JS event loop until all the ops have been processed by the server and by the delta managers.
      *
      * @param deltaMgrs - Array of delta managers whose ops to process. If no delta manager is provided, it
      * processes the ops for all the delta managers in our collection.
      */
    public async process(...deltaMgrs: DeltaManager[]): Promise<void> {
        const toggles = this.mapDeltaManagerToggle(deltaMgrs);

        // Pause the queues of all the delta managers in our collection to make sure that we only process the ops of
        // the requested delta managers.
        await this.pauseAllDeltaManagerQueues();

        // Resume the delta queues so that we can process incoming and outgoing ops.
        toggles.forEach((toggle) => toggle.toggleResumeAll());

        // Wait for all pending ops to be processed.
        await this.yieldWhileDeltaManagersHaveWork(
            toggles,
            (deltaManager) => !deltaManager.inbound.idle || !deltaManager.outbound.idle);
    }

    /**
     * Processes incoming ops of the given delta managers.
     * It validates the delta managers and resumes its inbound queue. It then keeps yielding the JS event loop until
     * all the ops have been processed by the server and by the delta managers.
     *
     * @param deltaMgrs - Array of delta managers whose incoming ops to process. If no delta manager is provided, it
     * processes the ops for all the delta managers in our collection.
     */
    public async processIncoming(...deltaMgrs: DeltaManager[]): Promise<void> {
        const toggles = this.mapDeltaManagerToggle(deltaMgrs);

        // Pause the queues of all the delta managers in our collection to make sure that we only process the incoming
        // ops of the requested delta managers.
        await this.pauseAllDeltaManagerQueues();

        // Resume the inbound delta queue so that we can process incoming ops.
        toggles.forEach((toggle) => {
            toggle.toggleResumeInbound();
        });

        // Wait for all pending incoming ops to be processed.
        await this.yieldWhileDeltaManagersHaveWork(
            toggles,
            (deltaManager) => !deltaManager.inbound.idle);
    }

    /**
     * Processes outgoing ops of the given delta managers.
     * It validates the delta managers and resumes its outbound queue. It then keeps yielding the JS event loop until
     * all the ops have been processed by the server and by the delta managers.
     *
     * @param deltaMgrs - Array of delta managers whose outgoing ops to process. If no delta manager is provided, it
     * processes the ops for all the delta managers in our collection.
     */
    public async processOutgoing(...deltaMgrs: DeltaManager[]): Promise<void> {
        const toggles = this.mapDeltaManagerToggle(deltaMgrs);

        // Pause the queues of all the delta managers in our collection to make sure that we only process the outgoing
        // ops of the requested delta managers.
        await this.pauseAllDeltaManagerQueues();

        // Resume the outbound delta queue so that we can process outgoing ops.
        toggles.forEach((toggle) => {
            toggle.toggleResumeOutbound();
        });

        // Wait for all pending outgoing ops to be processed.
        await this.yieldWhileDeltaManagersHaveWork(
            toggles,
            (deltaManager) => !deltaManager.outbound.idle);
    }

    /**
     * Pauses the delta processing for controlled testing by pausing the inbound and outbound queues of the delta
     * managers.
     *
     * @param deltaMgrs - Array of delta managers whose processing to pause. If no delta manager is provided, it
     * pauses the processing of all the delta managers in our collection.
     */
    public async pauseProcessing(...deltaMgrs: DeltaManager[]) {
        const toggles = this.mapDeltaManagerToggle(deltaMgrs);

        // Pause the inbound and outbound delta queues.
        await this.pauseDeltaManagerQueues(toggles);

        this.isNormalProcessingPaused = true;
    }

    /**
     * Resumes the delta processing after a pauseProcessing calls by resuming the inbound and outbound queues of
     * the delta managers.
     *
     * @param deltaMgrs - Array of delta managers whose processing to resume. If no delta manager is provided, it
     * resumes the processing of all the delta managers in our collection.
     */
    public resumeProcessing(...deltaMgrs: DeltaManager[]) {
        const toggles = this.mapDeltaManagerToggle(deltaMgrs);

        // Resume the inbound and outbound delta queues.
        toggles.forEach((toggle) => toggle.toggleResumeAll());

        this.isNormalProcessingPaused = false;
    }

    /**
     * Map a list of DeltaManager to its toggle.  Throw an error if the delta manager is not in our collection
     * @param deltaMgrs - The delta managers to get the toggles for
     */
    private mapDeltaManagerToggle(deltaMgrs: DeltaManager[]) {
        if (deltaMgrs.length === 0) {
            // If no delta managers are provided, process all delta managers in our collection.
            return Array.from(this.deltaManagerToggles.values());
        }

        return deltaMgrs.map((deltaManager) => {
            const toggle = this.deltaManagerToggles.get(deltaManager);
            assert(toggle, "All delta managers must be added to deterministically control processing");
            return toggle;
        });
    }

    /**
     * It keeps yielding the JS event loop until  all the ops have been processed by the server and by the passed
     * delta managers.
     * @param toggles - The delta managers should ops have to be processed.
     * @param hasWork - Function that tells if the delta manager has pending work or not.
     */
    private async yieldWhileDeltaManagersHaveWork(
        toggles: Iterable<DeltaManagerToggle>,
        hasWork: (deltaManagers: DeltaManager) => boolean,
    ): Promise<void> {
        let working: boolean;
        do {
            await OpProcessingController.yield();
            working = await this.deltaConnectionServerMonitor.hasPendingWork();
            if (!working) {
                for (const toggle of toggles) {
                    if (hasWork(toggle.deltaManager)) {
                        working = true;
                        break;
                    }
                }
            }
        } while (working);

        // If deterministically controlling events, need to pause before continuing
        if (this.isNormalProcessingPaused) {
            await this.pauseDeltaManagerQueues(toggles);
        }
    }

    /**
     * Pauses the inbound and outbound queues of all the delta managers given
     * @param toggles - The delta managers should ops have to be processed.
     */
    private async pauseDeltaManagerQueues(toggles: Iterable<DeltaManagerToggle>) {
        const p: Promise<[void, void]>[] = [];
        for (const toggle of toggles) {
            p.push(toggle.togglePauseAll());
        }
        return Promise.all(p);
    }

    /**
     * Pauses the inbound and outbound queues of all the delta managers in our collection.
     */
    private async pauseAllDeltaManagerQueues() {
        return this.pauseDeltaManagerQueues(this.deltaManagerToggles.values());
    }
}
