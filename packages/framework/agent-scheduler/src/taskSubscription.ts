/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IEvent } from "@fluidframework/core-interfaces";

import { IAgentScheduler } from "./agent.js";

/**
 * Events emitted by {@link TaskSubscription}.
 * @legacy
 * @alpha
 */
export interface ITaskSubscriptionEvents extends IEvent {
	(event: "gotTask" | "lostTask", listener: () => void);
}

/**
 * TaskSubscription works with an AgentScheduler to make it easier to monitor a specific task ownership.
 * @legacy
 * @alpha
 */
export class TaskSubscription extends TypedEventEmitter<ITaskSubscriptionEvents> {
	private subscribed: boolean = false;

	/**
	 * @param agentScheduler - The AgentScheduler that will be subscribed against
	 * @param taskId - The string ID of the task to subscribe against
	 */
	constructor(
		private readonly agentScheduler: IAgentScheduler,
		public readonly taskId: string,
	) {
		super();
		agentScheduler.on("picked", (_taskId: string) => {
			if (_taskId === this.taskId) {
				this.emit("gotTask");
			}
		});
		agentScheduler.on("released", (_taskId: string) => {
			if (_taskId === this.taskId) {
				this.emit("lostTask");
			}
		});
		agentScheduler.on("lost", (_taskId: string) => {
			if (_taskId === this.taskId) {
				this.emit("lostTask");
			}
		});
	}

	/**
	 * Check if currently holding ownership of the task.
	 * @returns true if currently the task owner, false otherwise.
	 */
	public haveTask(): boolean {
		return this.agentScheduler.pickedTasks().includes(this.taskId);
	}

	/**
	 * Volunteer for the task.  By default, the TaskSubscription will only watch the task and not volunteer.
	 * This is safe to call multiple times across multiple TaskSubscriptions.
	 */
	public volunteer(): void {
		if (!this.subscribed) {
			// AgentScheduler throws if the same task is picked twice but we don't care because our
			// worker does nothing.  We only care that the AgentScheduler is trying to pick.
			// We also don't care if we throw due to failing the interactive check, because then we'll
			// just appear to never get the task.
			this.agentScheduler.pick(this.taskId, async () => {}).catch(() => {});
			this.subscribed = true;
		}
	}
}
