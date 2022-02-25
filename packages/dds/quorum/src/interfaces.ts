/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface ITaskManagerEvents extends ISharedObjectEvents {
    /**
     * Notifies when the local client has reached or left the front of the queue.  Does not account for known pending
     * ops, but instead only reflects the current state.
     */
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
     * Exit the queue, releasing the task if currently locked.
     * @param taskId - Identifier for the task
     */
    abandon(taskId: string): void;

    /**
     * Check whether this client is the current assignee for the task and there is no outstanding abandon op that
     * would release the lock.
     * @param taskId - Identifier for the task
     */
    haveTaskLock(taskId: string): boolean;

    /**
     * Check whether this client is either the current assignee for the task or is waiting in line or we expect they
     * will be in line after outstanding ops have been ack'd.
     * @param taskId - Identifier for the task
     */
    queued(taskId: string): boolean;
}
