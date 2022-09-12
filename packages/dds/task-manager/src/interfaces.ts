/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface ITaskManagerEvents extends ISharedObjectEvents {
    /**
     * Notifies when the local client has reached the front of the queue, left the queue, or a task was completed.
     * Does not account for known pending ops, but instead only reflects the current state.
     */
    (event: "assigned" | "completed" | "lost", listener: (taskId: string) => void);
}

/**
 * Task manager interface
 */

export interface ITaskManager extends ISharedObject<ITaskManagerEvents> {
    /**
     * Volunteer for the task.  Promise resolves true when the task is assigned to the local client. It rejects if the
     * local client is removed from the queue without being assigned the task for any reason, such as disconnecting or
     * abandoning the task while in queue.
     * @param taskId - Identifier for the task
     */
    volunteerForTask(taskId: string): Promise<boolean>;

    /**
     * Continuously volunteer to lock the task.  Watch the "assigned" event to determine if the task lock is assigned.
     * We automatically re-enter the queue if the task lock is lost for any reason.
     * @param taskId - Identifier for the task
     */
    subscribeToTask(taskId: string): void;

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
    assigned(taskId: string): boolean;

    /**
     * Check whether this client is either the current assignee for the task or is waiting in line or we expect they
     * will be in line after outstanding ops have been ack'd.
     * @param taskId - Identifier for the task
     */
    queued(taskId: string): boolean;

    /**
     * Check whether this client is subscribed for the task.
     * @param taskId - Identifier for the task
     */
    subscribed(taskId: string): boolean;

    /**
     * Marks a task as completed and releases all clients from its queue.
     * @param taskId - Identifier for the task
     */
    complete(taskId: string): void;
}
