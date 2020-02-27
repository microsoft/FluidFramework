/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
    IComponentRouter,
    IComponentRunnable,
} from "@microsoft/fluid-component-core-interfaces";

/**
 * Definition of a Task.
 */
export interface ITask {
    /**
     * Id of the task
     */
    id: string;

    /**
     * Instance of the task that implements IComponentRunnable
     */
    instance: IComponentRunnable;
}

export interface IProvideTaskManager {
    readonly ITaskManager: ITaskManager;
}

/**
 * Task manager enables app to register and pick tasks.
 */
export interface ITaskManager extends IProvideTaskManager, IComponentLoadable, IComponentRouter {
    /**
     * Registers tasks task so that the client can run the task later.
     */
    register(...tasks: ITask[]): void;

    /**
     * Pick a task that was registered prior.
     *
     * @param worker - Flag that will execute tasks in web worker if connected to a service that supports them.
     */
    pick(componentUrl: string, taskId: string, worker?: boolean): Promise<void>;
}

export interface IProvideAgentScheduler {
    readonly IAgentScheduler: IAgentScheduler;
}

/**
 * Agent scheduler distributes a set of tasks/variables across connected clients.
 */
export interface IAgentScheduler extends IProvideAgentScheduler, IComponentRouter, IComponentLoadable {
    /**
     * Whether this instance is the leader.
     */
    leader: boolean;

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
     * @param worker - Flag that will execute tasks in web worker if connected to a service that supports them.
     */
    pick(taskId: string, worker: boolean): Promise<void>;

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
    on(event: "notleader" | "leader" | "picked" | "released", listener: (...args: any[]) => void): this;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends
        Readonly<Partial<IProvideTaskManager & IProvideAgentScheduler>> { }
}
