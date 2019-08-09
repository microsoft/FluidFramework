/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
    IComponentRouter,
    IComponentRunnable,
} from "@prague/component-core-interfaces";

export interface ITask {
    id: string;
    instance: IComponentRunnable;
}

/**
 * Wrapper on top of IAgentScheduler.
 */
export interface ITaskManager extends IComponentLoadable, IComponentRouter {
    pick(componentUrl: string, ...tasks: ITask[]): Promise<void>;
}

/**
 * Agent scheduler distributes a set of tasks/variables across connected clients.
 */
export interface IAgentScheduler extends IComponentRouter {
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
     */
    pick(...taskUrls: string[]): Promise<void>;

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
    on(event: "leader" | "picked" | "running", listener: (...args: any[]) => void): this;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent {
        readonly IAgentScheduler?: IAgentScheduler;
        readonly ITaskManager?: ITaskManager;
    }
}
