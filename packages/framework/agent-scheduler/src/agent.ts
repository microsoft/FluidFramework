/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider, IFluidLoadable } from "@fluidframework/core-interfaces";

/**
 * @alpha
 */
export const IAgentScheduler: keyof IProvideAgentScheduler = "IAgentScheduler";

/**
 * @alpha
 */
export interface IProvideAgentScheduler {
	readonly IAgentScheduler: IAgentScheduler;
}

/**
 * Events emitted by {@link (IAgentScheduler:interface)}.
 * @alpha
 */
export interface IAgentSchedulerEvents extends IEvent {
	/**
	 * Event when ownership of task changes
	 * @param event - name of the event:
	 *
	 * - "picked" - the task has been assigned to this client, in response to pick() being called
	 * If client loses this task (due to disconnect), it will attempt to pick it again (on connection)
	 * automatically, unless release() is called
	 *
	 * - "released" - the task was successfully released back to the pool. Client will not attempt to
	 * re-acquire the task, unless pick() is called.
	 *
	 * - "lost" - task is lost due to disconnect or data store / container being attached.
	 * Task will be picked up again by some connected client (this client will try as well,
	 * unless release() is called)
	 *
	 * @param listener - callback notified when change happened for particular key
	 */
	(event: "picked" | "released" | "lost", listener: (taskId: string) => void);
}

/**
 * Agent scheduler distributes a set of tasks/variables across connected clients.
 * @alpha
 */
export interface IAgentScheduler
	extends IProvideAgentScheduler,
		IEventProvider<IAgentSchedulerEvents>,
		IFluidLoadable {
	/**
	 * Registers a set of new tasks to distribute amongst connected clients. Only use this if a client wants
	 * a new agent to run but does not have the capability to run the agent inside the host.
	 * Client can call pick() later if the capability changes.
	 *
	 * This method should only be called once per task. Duplicate calls will be rejected.
	 */
	register(...taskUrls: string[]): Promise<void>;

	/**
	 * Attempts to pick a set of tasks. A client will only run the task if it's chosen based on consensus.
	 * Resolves when the tasks are assigned to one of the connected clients.
	 *
	 * This method should only be called once per task. Duplicate calls will be rejected.
	 *
	 * @param worker - callback to run when task is picked up.
	 */
	pick(taskId: string, worker: () => Promise<void>): Promise<void>;

	/**
	 * Releases a set of tasks for other clients to grab. Resolves when the tasks are released.
	 *
	 * Only previously picked tasks are allowed. Releasing non picked tasks will get a rejection.
	 * App can call pickedTasks() to get the picked list first.
	 */
	release(...taskUrls: string[]): Promise<void>;

	/**
	 * Returns a list of all tasks running on this client
	 */
	pickedTasks(): string[];
}
