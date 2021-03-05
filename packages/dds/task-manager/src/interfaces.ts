/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface ITaskManagerEvents extends ISharedObjectEvents {
    (event: "assigned" | "lost", listener: (taskId: string) => void);
}

/**
 * Task manager interface
 */

export interface ITaskManager extends ISharedObject<ITaskManagerEvents> {
    /**
     * Try to lock the task.  Promise resolves when the lock is acquired, or rejects if we are removed from the
     * queue without acquiring the lock for any reason.
     * @param taskId
     */
    lockTask(taskId: string): Promise<void>;

    /**
     * Exit the queue, I immediately drop assigned/queued status
     * @param taskId
     */
    abandon(taskId: string): void;

    /**
     * Am I the currently assigned client?
     * @param taskId
     */
    haveTaskLock(taskId: string): boolean;

    /**
     * Are we already trying to acquire the task lock?
     * @param taskId
     */
    queued(taskId: string): boolean;
}
