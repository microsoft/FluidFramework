/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

type TaskCallback = () => void;
type TaskQueue = (callback: TaskCallback) => void;

export class Scheduler {
    private static readonly done = Promise.resolve();
    private readonly turnTasks: TaskCallback[] = [];
    private readonly layoutTasks: TaskCallback[] = [];

    public readonly onTurnEnd = (callback: TaskCallback) => {
        if (this.turnTasks.push(callback) === 1) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Scheduler.done.then(this.processTurnTasks);
        }
    };

    public readonly onLayout = (callback: TaskCallback) => {
        this.layoutTasks.push(callback);
        if (this.layoutQueueLength === 1) {
            requestAnimationFrame(this.processLayoutTasks);
        }
    };

    private get layoutQueueLength() {
        return this.layoutTasks.length;
    }

    public coalesce(queue: TaskQueue, callback: TaskCallback) {
        let scheduled = false;

        return () => {
            if (scheduled) {
                return;
            }

            queue(() => {
                // Reset 'scheduled' before invoking callback to prevent a coalesced task from
                // becoming permanently unschedulable if 'callback()' throws.
                scheduled = false;

                callback();
            });

            scheduled = true;
        };
    }

    private dispatch(tasks: TaskCallback[]) {
        // Outer loop to resume dispatch if any of the tasks throw an error.
        for (let i = 0; i < tasks.length;) {
            const length = tasks.length;
            try {
                // Inner loop avoids overhead of try/catch per task.
                do { tasks[i++](); } while (i < length);
            } catch (error) {
                console.error(error);
            }
        }
        tasks.length = 0;
    }

    private readonly processTurnTasks = () => {
        this.dispatch(this.turnTasks);
    };

    private readonly processLayoutTasks = () => {
        this.dispatch(this.layoutTasks);
    };
}
