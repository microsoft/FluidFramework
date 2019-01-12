type TaskCallback = () => void;

export class Scheduler {
    private framePending = false;
    private frameTasks: TaskCallback[] = [];

    private readonly processFrameTasks = () => {
        for (const task of this.frameTasks) {
            task();
        }

        console.log(`Processed ${this.frameTasks.length} frame tasks.`);
        this.frameTasks.length = 0;
        this.framePending = false;
    }

    public requestFrame(callback: TaskCallback) {
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
}