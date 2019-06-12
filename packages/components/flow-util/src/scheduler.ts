type TaskCallback = () => void;
type TaskQueue = (callback: TaskCallback) => void;

const idleThresholdMS = 60;
const idleTaskTurnBreak = 2;

export class Scheduler {
    private static readonly done = Promise.resolve();
    private lastDispatchMS = Date.now();
    private readonly turnTasks: TaskCallback[] = [];
    private readonly layoutTasks: TaskCallback[] = [];
    private readonly postLayoutTasks: TaskCallback[] = [];
    private readonly idleTasks: TaskCallback[] = [];

    public readonly onTurnEnd = (callback: TaskCallback) => {
        if (this.turnTasks.push(callback) === 1) {
            // tslint:disable-next-line:no-floating-promises
            Scheduler.done.then(this.processTurnTasks);
        }
    }

    public readonly onLayout = (callback: TaskCallback) => {
        this.layoutTasks.push(callback);
        if (this.layoutQueueLength === 1) {
            requestAnimationFrame(this.processLayoutTasks);
        }
    }

    public readonly onPostLayout = (callback: TaskCallback) => {
        this.postLayoutTasks.push(callback);
        if (this.layoutQueueLength === 1) {
            requestAnimationFrame(this.processLayoutTasks);
        }
    }

    public readonly onIdle = (callback: TaskCallback) => {
        if (this.idleTasks.push(callback) === 1) {
            this.scheduleIdleTasks(this.idleDueMS(Date.now()));
        }
    }

    private get layoutQueueLength() {
        return this.layoutTasks.length + this.postLayoutTasks.length;
    }

    public coalesce(queue: TaskQueue, callback: TaskCallback) {
        let scheduled = false;

        return () => {
            if (scheduled) {
                return;
            }

            queue(() => {
                callback();
                scheduled = false;
            });

            scheduled = true;
        };
    }

    private dispatch(tasks: TaskCallback[]) {
        for (const task of tasks) {
            task();
        }
        tasks.length = 0;
    }

    private readonly processTurnTasks = () => {
        this.dispatch(this.turnTasks);
        this.lastDispatchMS = Date.now();
    }

    private readonly processLayoutTasks = () => {
        this.dispatch(this.layoutTasks);
        this.dispatch(this.postLayoutTasks);
        this.lastDispatchMS = Date.now();
    }

    private scheduleIdleTasks(dueMS: number) {
        setTimeout(this.processIdleTasks, dueMS);
    }

    private idleDueMS(nowMS: number) {
        return Math.max(this.lastDispatchMS + idleThresholdMS - nowMS, 0);
    }

    private readonly processIdleTasks = () => {
        const start = Date.now();

        const due = this.idleDueMS(start);
        if (start < due) {
            this.scheduleIdleTasks(due);
        }

        const tasks = this.idleTasks;
        const deadline = start + idleTaskTurnBreak;

        for (let i = 0; i < tasks.length; i++) {
            tasks[i]();

            if (Date.now() > deadline) {
                tasks.splice(0, i);
                this.scheduleIdleTasks(0);
            }
        }

        tasks.length = 0;
    }
}
