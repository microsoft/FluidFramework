/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Manages a queue of work to be batch processed at next javascript turn of execution
 */
export class BatchManager<T> {
    private pendingWork = new Map<string, T[]>();
    private pendingTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Creates an instance of BatchManager.
     * @param process - callback to process the work
     */
    constructor(
        private readonly process: (id: string, work: T[]) => void,
        private readonly maxBatchSize: number = 100) {
    }

    /**
     * Queue up a work item to be processed
     *
     * @param id - id of the batch to add the work item to
     * @param work - the work item to be added
     */
    public add(id: string, work: T) {
        if (!this.pendingWork.has(id)) {
            this.pendingWork.set(id, []);
        }

        this.pendingWork.get(id)!
            .push(work);

        if (this.pendingWork.get(id)!.length >= this.maxBatchSize) {
            if (this.pendingTimer !== undefined) {
                clearTimeout(this.pendingTimer);
            }
            this.pendingTimer = undefined;
            this.startWork();
        } else if (this.pendingTimer === undefined) {
            this.pendingTimer = setTimeout(
                () => {
                    this.pendingTimer = undefined;
                    this.startWork();
                },
                0);
        }
    }

    /**
     * Process all the pending work item synchronously now
     */
    public drain(): void {
        this.startWork();
    }

    private startWork() {
        // Clear the internal flags first to avoid issues in case any of the pending work calls back into
        // the batch manager. We could also do this with a second setImmediate call but avoiding in order
        // to process the work quicker.
        const pendingWork = this.pendingWork;
        this.pendingWork = new Map<string, T[]>();

        // TODO log to influx how much pending work there is. We want to limit the size of a batch
        for (const [id, batch] of pendingWork) {
            this.process(id, batch);
        }
    }
}
