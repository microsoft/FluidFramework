const MaxBatchSize = 100;

export class BatchManager<T> {
    private pendingWork = new Map<string, T[]>();
    private pendingTimer: NodeJS.Timer;

    constructor(private readonly process: (id: string, work: T[]) => void) {
    }

    public add(id: string, work: T) {
        if (!this.pendingWork.has(id)) {
            this.pendingWork.set(id, []);
        }

        this.pendingWork.get(id)
            .push(work);

        if (this.pendingWork.get(id).length >= MaxBatchSize) {
            clearTimeout(this.pendingTimer);
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
