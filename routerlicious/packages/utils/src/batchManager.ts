export class BatchManager<T> {
    private pendingWork = new Map<string, T[]>();

    constructor(private process: (id: string, work: T[]) => void) {
    }

    public add(id: string, work: T) {
        // Schedule the work callback if the pending work queue is empty
        const shouldScheduleWork = this.pendingWork.size === 0;

        if (!this.pendingWork.has(id)) {
            this.pendingWork.set(id, []);
        }

        this.pendingWork.get(id).push(work);

        if (shouldScheduleWork) {
            process.nextTick(() => {
                this.startWork();
            });
        }
    }

    /**
     * Resolves once all pending work is complete
     */
    public async drain(): Promise<void> {
        this.startWork();
    }

    private startWork() {
        // Clear the internal flags first to avoid issues in case any of the pending work calls back into
        // the batch manager. We could also do this with a second setImmediate call but avodiing in order
        // to process the work quicker.
        const pendingWork = this.pendingWork;
        this.pendingWork = new Map<string, T[]>();

        // TODO log to influx how much pending work there is. We want to limit the size of a batch
        for (const [id, batch] of pendingWork) {
            this.process(id, batch);
        }
    }
}
