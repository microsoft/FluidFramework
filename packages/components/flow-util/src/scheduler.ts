type TaskCallback = () => void;
type TaskQueue = (callback: TaskCallback) => void;

const idleThresholdMS = 60;
const idleTaskTurnBreak = 2;

export class Scheduler {
    private lastDispatchMS = Date.now();
    private readonly layoutTasks: TaskCallback[] = [];
    private readonly idleTasks: TaskCallback[] = [];

    public readonly onLayout = (callback: TaskCallback) => {
        if (this.layoutTasks.push(callback) === 1) {
            requestAnimationFrame(this.processLayoutTasks);
        }
    }

    public readonly onIdle = (callback: TaskCallback) => {
        if (this.idleTasks.push(callback) === 1) {
            this.scheduleIdleTasks(this.idleDueMS(Date.now()));
        }
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

    private readonly processLayoutTasks = () => {
        for (const task of this.layoutTasks) {
            task();
        }

        this.layoutTasks.length = 0;
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
