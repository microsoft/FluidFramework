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
     * @param taskId - Identifier for the task
     */
    lockTask(taskId: string): Promise<void>;

    /**
     * Exit the queue immediately.
     * @param taskId - Identifier for the task
     */
    abandon(taskId: string): void;

    /**
     * Check whether this client is the current assignee for the task.
     * @param taskId - Identifier for the task
     */
    haveTaskLock(taskId: string): boolean;

    /**
     * Check whether this client is either the current assignee for the task or is waiting in line.
     * @param taskId - Identifier for the task
     */
    queued(taskId: string): boolean;
}
