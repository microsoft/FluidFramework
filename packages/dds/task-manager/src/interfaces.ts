/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Describes the event listener format for {@link ITaskManagerEvents} events.
 *
 * @param taskId - The unique identifier of the related task.
 * @legacy
 * @alpha
 */
export type TaskEventListener = (taskId: string) => void;

/**
 * Events emitted by {@link ITaskManager}.
 * @legacy
 * @alpha
 */
export interface ITaskManagerEvents extends ISharedObjectEvents {
	/**
	 * Fires when a task has been exclusively assigned to the client.
	 *
	 * @remarks Does not account for known pending ops, but instead only reflects the current state.
	 *
	 * @eventProperty
	 */
	(event: "assigned", listener: TaskEventListener);

	/**
	 * Fires when a task the client is queued for is completed.
	 *
	 * @eventProperty
	 */
	(event: "completed", listener: TaskEventListener);

	/**
	 * Fires when the task assignment is lost by the local client.
	 *
	 * @remarks This could be due to the client disconnecting or by manually calling {@link ITaskManager.abandon}.
	 *
	 * @eventProperty
	 */
	(event: "lost", listener: TaskEventListener);
}

/**
 * A distributed data structure that tracks queues of clients that want to exclusively run a task.
 *
 * @example Creation
 *
 * To create a {@link ITaskManager}, call the static create method:
 *
 * ```typescript
 * const taskManager = TaskManager.create(this.runtime, id);
 * ```
 *
 * @example Usage
 *
 * To volunteer for a task, use the {@link ITaskManager.volunteerForTask} method.
 * This returns a Promise that will resolve once the client has acquired exclusive rights to run the task,
 * or reject if the client is removed from the queue without acquiring the rights.
 *
 * ```typescript
 * taskManager.volunteerForTask("NameOfTask")
 *     .then(() => { doTheTask(); })
 *     .catch((err) => { console.error(err); });
 * ```
 *
 * Alternatively, you can indefinitely volunteer for a task with the synchronous {@link ITaskManager.subscribeToTask}
 * method. This method does not return a value, therefore you need to rely on eventing to know when you have acquired
 * the rights to run the task (see below).
 *
 * ```typescript
 * taskManager.subscribeToTask("NameOfTask");
 * ```
 *
 * To check if the local client is currently subscribed to a task, use the {@link ITaskManager.subscribed} method.
 *
 * ```typescript
 * if (taskManager.subscribed("NameOfTask")) {
 *     console.log("This client is currently subscribed to the task.");
 * }
 * ```
 *
 * To release the rights to the task, use the {@link ITaskManager.abandon} method.
 * The next client in the queue will then get the rights to run the task.
 *
 * ```typescript
 * taskManager.abandon("NameOfTask");
 * ```
 *
 * To inspect your state in the queue, you can use the {@link ITaskManager.queued} and {@link ITaskManager.assigned}
 * methods.
 *
 * ```typescript
 * if (taskManager.queued("NameOfTask")) {
 *     console.log("This client is somewhere in the queue, potentially even having the task assignment.");
 * }
 *
 * if (taskManager.assigned("NameOfTask")) {
 *     console.log("This client currently has the rights to run the task");
 * }
 * ```
 *
 * To signal to other connected clients that a task is completed, use the {@link ITaskManager.complete} method.
 * This will release all clients from the queue and emit the "completed" event.
 *
 * ```typescript
 * taskManager.complete("NameOfTask");
 * ```
 *
 * @example Eventing
 *
 * `ITaskManager` will emit events when a task is assigned to the client, when the task assignment is lost,
 * and when a task was completed by another client.
 *
 * ```typescript
 * taskManager.on("assigned", (taskId: string) => {
 *     console.log(`Client was assigned task: ${taskId}`);
 * });
 *
 * taskManager.on("lost", (taskId: string) => {
 *     console.log(`Client released task: ${taskId}`);
 * });
 *
 * taskManager.on("completed", (taskId: string) => {
 *     console.log(`Another client completed task: ${taskId}`);
 * });
 * ```
 *
 * These can be useful if the logic to volunteer for a task is separated from the logic to perform the task, such as
 * when using {@link ITaskManager.subscribeToTask}.
 *
 * See {@link ITaskManagerEvents} for more details.
 * @legacy
 * @alpha
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
