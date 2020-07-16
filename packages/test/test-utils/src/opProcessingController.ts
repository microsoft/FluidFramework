/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager } from "@fluidframework/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";

// An IDeltaManager alias to be used within this class.
export type DeltaManager = IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

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

    private readonly deltaManagers: Set<DeltaManager> = new Set<DeltaManager>();

    private isNormalProcessingPaused = false;

    /*
    * Is processing being deterministically controlled, or are changes allowed to flow freely?
    */
    public get isProcessingControlled(): boolean {
        return this.isNormalProcessingPaused;
    }

    /**
     * @param localDeltaConnectionServer - instance of delta connection server
     */
    public constructor(private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer) { }

    /**
     * Add a collection of delta managers by adding them to the local collection.
     * @param deltaManagers - Array of deltaManagers to add
     */
    public addDeltaManagers(...deltaManagers: DeltaManager[]) {
        deltaManagers.forEach((doc) => {
            this.deltaManagers.add(doc);
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
        this.validateDeltaManagers(deltaMgrs);

        // Pause the queues of all the delta managers in our collection to make sure that we only process the ops of
        // the requested delta managers.
        await this.pauseAllDeltaManagerQueues();

        // If no delta managers are provided, process all delta managers in our collection.
        const deltaManagers = deltaMgrs.length === 0 ? Array.from(this.deltaManagers) : deltaMgrs;

        // Resume the delta queues so that we can process incoming and outgoing ops.
        deltaManagers.forEach((deltaManager) => {
            deltaManager.inbound.resume();
            deltaManager.outbound.resume();
        });

        // Wait for all pending ops to be processed.
        await this.yieldWhileDeltaManagersHaveWork(
            deltaManagers,
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
        this.validateDeltaManagers(deltaMgrs);

        // Pause the queues of all the delta managers in our collection to make sure that we only process the incoming
        // ops of the requested delta managers.
        await this.pauseAllDeltaManagerQueues();

        // If no delta managers are provided, process all delta managers in our collection.
        const deltaManagers = deltaMgrs.length === 0 ? Array.from(this.deltaManagers) : deltaMgrs;

        // Resume the inbound delta queue so that we can process incoming ops.
        deltaManagers.forEach((deltaManager) => {
            deltaManager.inbound.resume();
        });

        // Wait for all pending incoming ops to be processed.
        await this.yieldWhileDeltaManagersHaveWork(
            deltaManagers,
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
        this.validateDeltaManagers(deltaMgrs);

        // Pause the queues of all the delta managers in our collection to make sure that we only process the outgoing
        // ops of the requested delta managers.
        await this.pauseAllDeltaManagerQueues();

        // If no delta managers are provided, process all delta managers in our collection.
        const deltaManagers = deltaMgrs.length === 0 ? Array.from(this.deltaManagers) : deltaMgrs;

        // Resume the outbound delta queue so that we can process outgoing ops.
        deltaManagers.forEach((deltaManager) => {
            deltaManager.outbound.resume();
        });

        // Wait for all pending outgoing ops to be processed.
        await this.yieldWhileDeltaManagersHaveWork(
            deltaManagers,
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
        this.validateDeltaManagers(deltaMgrs);

        // If no delta managers are provided, pause the queues of all delta managers in our collection.
        const deltaManagers = deltaMgrs.length === 0 ? Array.from(this.deltaManagers) : deltaMgrs;

        // Pause the inbound and outbound delta queues.
        for (const deltaManager of deltaManagers) {
            await deltaManager.inbound.pause();
            await deltaManager.outbound.pause();
        }

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
        this.validateDeltaManagers(deltaMgrs);

        // If no delta managers are provided, resume the queues of all delta managers in our collection.
        const deltaManagers = deltaMgrs.length === 0 ? Array.from(this.deltaManagers) : deltaMgrs;

        // Resume the inbound and outbound delta queues.
        deltaManagers.forEach((deltaManager) => {
            deltaManager.inbound.resume();
            deltaManager.outbound.resume();
        });

        this.isNormalProcessingPaused = false;
    }

    /**
     * Validates that the passed delta managers are added.
     * @param deltaManagers - The delta managers to be validated.
     */
    private validateDeltaManagers(deltaManagers: DeltaManager[]) {
        deltaManagers.forEach((deltaManager) => {
            if (!this.deltaManagers.has(deltaManager)) {
                throw new Error(
                    "All delta managers must be added to deterministically control processing");
            }
        });
    }

    /**
     * It keeps yielding the JS event loop until  all the ops have been processed by the server and by the passed
     * delta managers.
     * @param deltaManagers - The delta managers should ops have to be processed.
     * @param hasWork - Function that tells if the delta manager has pending work or not.
     */
    private async yieldWhileDeltaManagersHaveWork(
        deltaManagers: Iterable<DeltaManager>,
        hasWork: (deltaManagers: DeltaManager) => boolean,
    ): Promise<void> {
        let working: boolean;
        do {
            await OpProcessingController.yield();
            working = await this.localDeltaConnectionServer.hasPendingWork();
            if (!working) {
                for (const deltaManager of deltaManagers) {
                    if (hasWork(deltaManager)) {
                        working = true;
                        break;
                    }
                }
            }
        } while (working);

        // If deterministically controlling events, need to pause before continuing
        if (this.isNormalProcessingPaused) {
            for (const deltaManager of deltaManagers) {
                await deltaManager.inbound.pause();
                await deltaManager.outbound.pause();
            }
        }
    }

    /**
     * Pauses the inbound and outbound queues of all the delta managers in our collection.
     */
    private async pauseAllDeltaManagerQueues() {
        for (const deltaManager of this.deltaManagers) {
            await deltaManager.inbound.pause();
            await deltaManager.outbound.pause();
        }
    }
}
