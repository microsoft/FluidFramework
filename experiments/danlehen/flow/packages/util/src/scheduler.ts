import { BitOps } from "./bits"

enum SchedulerFlags {
    None = 0,
    FramePending = 1
}

type TaskCallback = () => void;

export class Scheduler {
    private flags: SchedulerFlags = SchedulerFlags.None;
    private frameTasks: TaskCallback[] = [];

    private readonly processFrameTasks = () => {
        for (const task of this.frameTasks) {
            task();
        }

        console.log(`Processed ${this.frameTasks.length} frame tasks.`);
        this.frameTasks.length = 0;
        this.flags = BitOps.clear(this.flags, SchedulerFlags.FramePending);
    }

    public requestFrame(callback: TaskCallback) {
        if (BitOps.test(this.flags, SchedulerFlags.FramePending)) {
            return;
        }

        this.frameTasks.push(callback);

        requestAnimationFrame(this.processFrameTasks);
        this.flags = BitOps.set(this.flags, SchedulerFlags.FramePending);
    }
}