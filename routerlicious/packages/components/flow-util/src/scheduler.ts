type TaskCallback = () => void;

export class Scheduler {
    private framePending = false;
    private readonly frameTasks: TaskCallback[] = [];

    public schedule(callback: TaskCallback) {
        // Record the new task.
        this.frameTasks.push(callback);

        // If the next animation frame callback is already scheduled, do nothing.
        if (this.framePending) {
            return;
        }

        // Otherwise...
        requestAnimationFrame(this.processFrameTasks);
        this.framePending = true;
    }

    public coalesce(callback: TaskCallback) {
        let scheduled = false;

        return () => {
            if (scheduled) {
                return;
            }

            this.schedule(() => {
                callback();
                scheduled = false;
            });

            scheduled = true;
        };
    }

    private readonly processFrameTasks = () => {
        for (const task of this.frameTasks) {
            task();
        }

        this.frameTasks.length = 0;
        this.framePending = false;
    }
}
