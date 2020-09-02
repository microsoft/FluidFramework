/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidLoadable,
    IFluidRouter,
    IFluidRunnable,
} from "@fluidframework/core-interfaces";

/**
 * Definition of a Task.
 */
export interface ITask {
    /**
     * Id of the task
     */
    id: string;

    /**
     * Instance of the task that implements IFluidRunnable
     */
    instance: IFluidRunnable;
}

export const ITaskManager: keyof IProvideTaskManager = "ITaskManager";

export interface IProvideTaskManager {
    readonly ITaskManager: ITaskManager;
}

/**
 * Task manager enables app to register and pick tasks.
 */
export interface ITaskManager extends IProvideTaskManager, IFluidLoadable, IFluidRouter {
    /**
     * access to IAgentScheduler
     */
    readonly IAgentScheduler: IAgentScheduler;

    /**
     * Registers tasks task so that the client can run the task later.
     */
    register(...tasks: ITask[]): void;

    /**
     * Pick a task that was registered prior.
     *
     * @param worker - Flag that will execute tasks in web worker if connected to a service that supports them.
     */
    pick(taskId: string, worker?: boolean): Promise<void>;
}

export const IAgentScheduler: keyof IProvideAgentScheduler = "IAgentScheduler";

export interface IProvideAgentScheduler {
    readonly IAgentScheduler: IAgentScheduler;
}

/**
 * Agent scheduler distributes a set of tasks/variables across connected clients.
 */
export interface IAgentScheduler extends IProvideAgentScheduler {
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

    /**
     * Event listeners
     */
    /**
     * Event when ownership of task changes
     * @param event - name of the event:
     * "picked" - the task has been assigned to this client, in response to pick() being called
     *      If client loses this task (due to disconnect), it will attempt to pick it again (on connection)
     *      automatically, unless release() is called
     * "released" - the task was successfully released back to the pool. Client will not attempt to
     *      re-acquire the task, unless pick() is called.
     * "lost" - task is lost due to disconnect or data store / container being attached.
     *      Task will be picked up again by some connected client (this client will try as well,
     *      unless release() is called)
     * @param listener - callback notified when change happened for particular key
     */
    on(event: "picked" | "released" | "lost", listener: (taskId: string) => void): this;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends
        Readonly<Partial<IProvideTaskManager & IProvideAgentScheduler>> { }
}
