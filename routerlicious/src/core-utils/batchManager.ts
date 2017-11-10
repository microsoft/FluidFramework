import { Deferred } from "../core-utils";

export class BatchManager<T> {
    private pendingWork: { [id: string]: T[] } = {};
    private workPending: Deferred<void>;

    constructor(private process: (id: string, work: T[]) => void) {
        // TODO should add in a max batch size to this to limit sent sizes
    }

    public add(id: string, work: T) {
        if (!(id in this.pendingWork)) {
            this.pendingWork[id] = [];
        }

        this.pendingWork[id].push(work);

        if (!this.workPending) {
            this.workPending = new Deferred<void>();
            process.nextTick(() => {
                // Clear the internal flags first to avoid issues in case any of the pending work calls back into
                // the batch manager. We could also do this with a second setImmediate call but avodiing in order
                // to process the work quicker.
                const pendingWork = this.pendingWork;
                this.pendingWork = {};
                this.workPending.resolve();
                this.workPending = null;

                // TODO - I may wish to have the processing return a promise and not attempt to perform another
                // batch of work until this current one is done (or has errored)
                this.processPendingWork(pendingWork);
            });
        }
    }

    /**
     * Resolves once all pending work is complete
     */
    public drain(): Promise<void> {
        return this.workPending ? this.workPending.promise : Promise.resolve();
    }

    private processPendingWork(pendingWork: { [id: string]: T[] }) {
        // TODO log to influx how much pending work there is. We want to limit the size of a batch
        // tslint:disable-next-line:forin
        for (const id in pendingWork) {
            this.process(id, pendingWork[id]);
        }
    }
}
