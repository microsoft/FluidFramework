export interface ITask {

    // id of the task
    id: string;

    // callback to run when the task gets picked by the client.
    callback(): void;
}

export interface IAgentScheduler {
    /**
     * Registers a set of new tasks to distribute amongst connected clients. Only use this if a client wants
     * a new agent to run but does not have the capability to run the agent inside the host.
     */
    register(...taskIds: string[]): void;

    /**
     * Attempts to pick a set of tasks. A client will only run the task if it's chosen based on consensus.
     * Resolves when the tasks are assigned to any connected client.
     *
     * This method should only be called once per task. Duplicate calls will be rejected.
     */
    pick(...tasks: ITask[]): Promise<void>;

    /**
     * Releases a set of tasks for other clients to grab. Resolves when the tasks are released.
     *
     * Only previously picked tasks are allowed. Non picked tasks will be rejected.
     * App should call pickedTasks() to get the picked list first.
     */
    release(...taskIds: string[]): Promise<void>;

    /**
     * Returns a list of all tasks running on this client
     */
    pickedTasks(): string[];
}
