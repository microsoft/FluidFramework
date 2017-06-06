// Overall batch manager for a set of objects

export class BatchManager<T> {
    private pendingWork: { [id: string]: T[] } = {};
    private workPending = false;

    constructor(private process: (id: string, work: T[]) => void) {
    }

    public add(id: string, work: T) {
        if (!(id in this.pendingWork)) {
            this.pendingWork[id] = [];
        }

        this.pendingWork[id].push(work);

        if (!this.workPending) {
            this.workPending = true;
            setImmediate(() => {
                // Clear the internal flags first to avoid issues in case any of the pending work calls back into
                // the batch manager. We could also do this with a second setImmediate call but avodiing in order
                // to process the work quicker.
                const pendingWork = this.pendingWork;
                this.pendingWork = {};
                this.workPending = false;

                // TODO - I may wish to have the processing return a promise and not attempt to perform another
                // batch of work until this current one is done (or has errored)
                this.processPendingWork(pendingWork);
            });
        }
    }

    private processPendingWork(pendingWork: { [id: string]: T[] }) {
        // tslint:disable-next-line:forin
        for (const id in pendingWork) {
            this.process(id, pendingWork[id]);
        }
    }
}
