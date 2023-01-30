/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

/**
 * Events emitted by {@link TaskManager}.
 */
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
	 * Volunteer for the task. Returns a promise that resolves `true` if the task is assigned to the local client and
	 * `false` if the task was completed by another client. It rejects if the local client abandoned the task or
	 * disconnected while in queue.
	 * @param taskId - Identifier for the task
	 */
	volunteerForTask(taskId: string): Promise<boolean>;

	/**
	 * Continuously volunteer for the task. Watch the "assigned" event to determine if the task is assigned.
	 * The local client will automatically re-enter the queue if it disconnects.
	 * @param taskId - Identifier for the task
	 */
	subscribeToTask(taskId: string): void;

	/**
	 * Exit the queue, releasing the task if currently assigned.
	 * @param taskId - Identifier for the task
	 */
	abandon(taskId: string): void;

	/**
	 * Check whether this client is the current assignee for the task and there is no outstanding abandon op that
	 * would abandon the assignment.
	 * @param taskId - Identifier for the task
	 */
	assigned(taskId: string): boolean;

	/**
	 * Check whether this client is either the current assignee, in queue, or we expect they will be in queue after
	 * outstanding ops have been ack'd.
	 * @param taskId - Identifier for the task
	 */
	queued(taskId: string): boolean;

	/**
	 * Check whether this client is currently subscribed to the task.
	 * @param taskId - Identifier for the task
	 */
	subscribed(taskId: string): boolean;

	/**
	 * Marks a task as completed and releases all clients from its queue.
	 * @param taskId - Identifier for the task
	 */
	complete(taskId: string): void;

	/**
	 * Check whether this client can currently volunteer for a task.
	 */
	canVolunteer(): boolean;
}
