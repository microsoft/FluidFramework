import { Component } from "@prague/app-component";
import { ConsensusRegisterCollection, ConsensusRegisterCollectionExtension } from "@prague/consensus-register-collection";
import { MapExtension } from "@prague/map";
import * as assert from "assert";
import * as debug from "debug";
import { IAgentScheduler, ITask } from "./interfaces";

interface IChanged {
    key: string;
}

export class AgentScheduler extends Component implements IAgentScheduler {

    private scheduler: ConsensusRegisterCollection;

    // List of all tasks client is capable of running. This is a strict superset of currently running tasks.
    private readonly localTaskMap = new Map<string, () => void>();

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [ConsensusRegisterCollectionExtension.Type, new ConsensusRegisterCollectionExtension()],
        ]);
    }

    public register(...taskIds: string[]): void {
        // TODO: Need to add a create method in consensus-register-collection
        throw new Error("Not implemented yet");
    }

    public async pick(...tasks: ITask[]): Promise<void> {
        for (const task of tasks) {
            if (this.localTaskMap.has(task.id)) {
                return Promise.reject(`${task.id} is already registered`);
            }
        }

        const availableTasks: ITask[] = [];
        for (const task of tasks) {
            this.localTaskMap.set(task.id, task.callback);
            // Check the current status and express interest if it's a new one (undefined) or currently unpicked (null).
            const currentStatus = this.scheduler.read(task.id);
            if (currentStatus === undefined || currentStatus === null) {
                availableTasks.push(task);
            }
        }
        return this.pickCore(availableTasks);
    }

    public async release(...taskIds: string[]): Promise<void> {
        for (const taskId of taskIds) {
            if (!this.localTaskMap.has(taskId)) {
                return Promise.reject(`${taskId} was never registered`);
            }
            if (this.scheduler.read(taskId) !== this.runtime.clientId) {
                return Promise.reject(`${taskId} was never picked`);
            }
        }
        return this.releaseCore([...taskIds]);
    }

    public pickedTasks(): string[] {
        const allPickedTasks = [];
        for (const taskId of this.scheduler.keys()) {
            if (this.scheduler.read(taskId) === this.runtime.clientId) {
                allPickedTasks.push(taskId);
            }
        }
        return allPickedTasks;
    }

    protected async create() {
        const scheduler = this.runtime.createChannel(
            "scheduler",
            ConsensusRegisterCollectionExtension.Type) as ConsensusRegisterCollection;
        this.root.set("scheduler", scheduler);
    }

    protected async opened() {
        this.scheduler = await this.root.wait("scheduler") as ConsensusRegisterCollection;
        await this.connected;

        const quorum = this.runtime.getQuorum();

        // Nobody released the tasks held by last client in previous session.
        // Check to see if this client needs to do this.
        // TODO: We need a leader in charge of this.
        const clearCandidates = [];

        for (const taskId of this.scheduler.keys()) {
            if (!quorum.getMembers().has(this.scheduler.read(taskId))) {
                clearCandidates.push(taskId);
            }
        }

        await this.clearTasks(clearCandidates);

        // Listeners for new/released tasks or left client tasks.
        // All clients will try to grab at the same time.
        // May be we want a randomized timer (Something like raft) to reduce chattiness?
        this.scheduler.on("valueChanged", async (changed: IChanged) => {
            const taskStatus = this.scheduler.read(changed.key);
            // Either a client registered for a new task or released a running task.
            if (taskStatus === null) {
                await this.pickNewTasks([changed.key]);
            }
        });

        quorum.on("removeMember", async (clientId: string) => {
            // Iterate and clear tasks held by the left client.
            // TODO: We need a leader for this.
            const leftTasks: string[] = [];
            for (const taskId of this.scheduler.keys()) {
                if (this.scheduler.read(taskId) === clientId) {
                    leftTasks.push(taskId);
                }
            }
            // TODO: Pick in random order to have some fairness guarantee.
            await this.clearTasks(leftTasks);
        });
    }

    // TODO: Host can provide a callback to check whether capability has changed.
    private async pickNewTasks(ids: string[]) {
        const possibleTasks: ITask[] = [];
        for (const id of ids) {
            if (this.localTaskMap.has(id)) {
                const task: ITask = {
                    callback: this.localTaskMap.get(id),
                    id,
                };
                possibleTasks.push(task);
            }
        }
        return this.pickCore(possibleTasks);
    }

    private async pickCore(tasks: ITask[]): Promise<void> {
        if (tasks.length > 0) {
            const picksP = [];
            for (const task of tasks) {
                debug(`Requesting ${task.id}`);
                picksP.push(this.scheduler.write(task.id, this.runtime.clientId));
            }
            await Promise.all(picksP);

            // The registers should have up to date results now. Start the respective task if this client was chosen.
            for (const task of tasks) {
                const pickedClientId = this.scheduler.read(task.id);
                assert(pickedClientId, `No client was chosen for ${task.id}`);
                if (pickedClientId === this.runtime.clientId) {
                    assert(this.localTaskMap.has(task.id), `Client did not try to pick ${task.id}`);
                    // invoke the associated callback with the task
                    task.callback();
                    debug(`Running ${task.id}`);
                } else {
                    debug(`${pickedClientId} is running ${task.id}`);
                }
            }
        }
    }

    private async releaseCore(taskIds: string[]) {
        if (taskIds.length > 0) {
            const releasesP = [];
            for (const id of taskIds) {
                debug(`Releasing ${id}`);
                // Remove from local map so that it can be picked later.
                this.localTaskMap.delete(id);
                // tslint:disable no-null-keyword
                releasesP.push(this.scheduler.write(id, null));
            }
            await Promise.all(releasesP);

            // Releases are not contested by definition. So every id should have null value now.
            for (const id of taskIds) {
                assert.equal(this.scheduler.read(id), null, `${id} was not released`);
                debug(`Released ${id}`);
            }
        }
    }

    private async clearTasks(taskIds: string[]) {
        if (taskIds.length > 0) {
            const clearP = [];
            for (const id of taskIds) {
                debug(`Clearing ${id}`);
                clearP.push(this.scheduler.write(id, null));
            }
            await Promise.all(clearP);

            // All registers should be null now.
            for (const id of taskIds) {
                assert.equal(this.scheduler.read(id), null, `${id} was not cleared`);
                debug(`Cleared ${id}`);
            }
        }
    }
}
