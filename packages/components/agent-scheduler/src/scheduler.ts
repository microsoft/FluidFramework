import { Component } from "@prague/app-component";
import { ConsensusRegisterCollection, ConsensusRegisterCollectionExtension } from "@prague/consensus-register-collection";
import { MapExtension } from "@prague/map";
import * as assert from "assert";
import * as debug from "debug";
import { IAgentScheduler, ITask } from "./interfaces";

interface IChanged {
    key: string;
}

const LeaderTaskId = "leader";

export class AgentScheduler extends Component implements IAgentScheduler {

    private scheduler: ConsensusRegisterCollection;

    // tslint:disable-next-line:variable-name private fields exposed via getters
    private _leader = false;

    // List of all tasks client is capable of running. This is a strict superset of tasks
    // running in the client.
    private readonly localTaskMap = new Map<string, () => void>();

    // Set of registered tasks client not capable of running.
    private readonly registeredTasks = new Set<string>();

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [ConsensusRegisterCollectionExtension.Type, new ConsensusRegisterCollectionExtension()],
        ]);
    }

    public get leader(): boolean {
        return this._leader;
    }

    public async register(...taskIds: string[]): Promise<void> {
        if (!this.runtime.connected) {
            return Promise.reject(`Client is not connected`);
        }
        for (const taskId of taskIds) {
            if (this.registeredTasks.has(taskId)) {
                return Promise.reject(`${taskId} is already registered`);
            }
        }
        const unregisteredTasks: string[] = [];
        for (const taskId of taskIds) {
            this.registeredTasks.add(taskId);
            // Only register for a new task.
            const currentClient = this.getTaskClientId(taskId);
            if (currentClient === undefined) {
                unregisteredTasks.push(taskId);
            }
        }
        return this.registerCore(unregisteredTasks);
    }

    public async pick(...tasks: ITask[]): Promise<void> {
        if (!this.runtime.connected) {
            return Promise.reject(`Client is not connected`);
        }
        for (const task of tasks) {
            if (this.localTaskMap.has(task.id)) {
                return Promise.reject(`${task.id} is already attempted`);
            }
        }

        const availableTasks: ITask[] = [];
        for (const task of tasks) {
            this.localTaskMap.set(task.id, task.callback);
            // Check the current status and express interest if it's a new one (undefined) or currently unpicked (null).
            const currentClient = this.getTaskClientId(task.id);
            if (currentClient === undefined || currentClient === null) {
                availableTasks.push(task);
            }
        }
        return this.pickCore(availableTasks);
    }

    public async release(...taskIds: string[]): Promise<void> {
        if (!this.runtime.connected) {
            return Promise.reject(`Client is not connected`);
        }
        for (const taskId of taskIds) {
            if (!this.localTaskMap.has(taskId)) {
                return Promise.reject(`${taskId} was never registered`);
            }
            if (this.getTaskClientId(taskId) !== this.runtime.clientId) {
                return Promise.reject(`${taskId} was never picked`);
            }
        }
        return this.releaseCore([...taskIds]);
    }

    public pickedTasks(): string[] {
        const allPickedTasks = [];
        for (const taskId of this.scheduler.keys()) {
            if (this.getTaskClientId(taskId) === this.runtime.clientId) {
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

        // Nobody released the tasks held by last client in previous session.
        // Check to see if this client needs to do this.
        const quorum = this.runtime.getQuorum();
        const clearCandidates = [];
        for (const taskId of this.scheduler.keys()) {
            if (!quorum.getMembers().has(this.getTaskClientId(taskId))) {
                clearCandidates.push(taskId);
            }
        }
        await this.clearTasks(clearCandidates);

        // Each client expresses interest to be a leader.
        const leaderElectionTask: ITask = {
            callback: () => {
                debug(`Elected as leader`);
            },
            id: LeaderTaskId,
        };

        await this.pick(leaderElectionTask);

        // There must be a leader now.
        const leaderClientId = this.getTaskClientId(LeaderTaskId);
        assert(leaderClientId, "No leader present");

        // Set leadership info
        this._leader = leaderClientId === this.runtime.clientId;

        // Listeners for new/released tasks. All clients will try to grab at the same time.
        // May be we want a randomized timer (Something like raft) to reduce chattiness?
        this.scheduler.on("valueChanged", async (changed: IChanged) => {
            const currentClient = this.getTaskClientId(changed.key);
            // Either a client registered for a new task or released a running task.
            if (currentClient === null) {
                await this.pickNewTasks([changed.key]);
            }
            // A new leader was picked. set leadership info.
            if (changed.key === LeaderTaskId && currentClient === this.runtime.clientId) {
                this._leader = true;
                this.emit("leader");
            }
        });

        // A client left the quorum. Iterate and clear tasks held by that client.
        // Ideally a leader should do this cleanup. But it's complicated when a leader itself leaves.
        // Probably okay for now to have every client do this.
        quorum.on("removeMember", async (clientId: string) => {
            const leftTasks: string[] = [];
            for (const taskId of this.scheduler.keys()) {
                if (this.getTaskClientId(taskId) === clientId) {
                    leftTasks.push(taskId);
                }
            }
            await this.clearTasks(leftTasks);
        });
    }

    private async pickNewTasks(ids: string[]) {
        if (this.runtime.connected) {
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
    }

    private async registerCore(taskIds: string[]): Promise<void> {
        if (taskIds.length > 0) {
            const registersP = [];
            for (const taskId of taskIds) {
                debug(`Registering ${taskId}`);
                // tslint:disable no-null-keyword
                registersP.push(this.writeCore(taskId, null));
            }
            await Promise.all(registersP);

            // The registers should have up to date results now. Check the status.
            for (const taskId of taskIds) {
                const taskStatus = this.getTaskClientId(taskId);

                // Task should be either registered (null) or picked up.
                assert(taskStatus !== undefined, `Unsuccessful registration`);

                if (taskStatus === null) {
                    debug(`Registered ${taskId}`);
                } else {
                    debug(`${taskStatus} is running ${taskId}`);
                }
            }
        }
    }

    private async pickCore(tasks: ITask[]): Promise<void> {
        if (tasks.length > 0) {
            const picksP = [];
            for (const task of tasks) {
                debug(`Requesting ${task.id}`);
                picksP.push(this.writeCore(task.id, this.runtime.clientId));
            }
            await Promise.all(picksP);

            // The registers should have up to date results now. Start the respective task if this client was chosen.
            for (const task of tasks) {
                const pickedClientId = this.getTaskClientId(task.id);

                // At least one client should pick up.
                assert(pickedClientId, `No client was chosen for ${task.id}`);

                // Check if this client was chosen.
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
                releasesP.push(this.writeCore(id, null));
            }
            await Promise.all(releasesP);

            // Releases are not contested by definition. So every id should have null value now.
            for (const id of taskIds) {
                assert.equal(this.getTaskClientId(id), null, `${id} was not released`);
                debug(`Released ${id}`);
            }
        }
    }

    private async clearTasks(taskIds: string[]) {
        if (this.runtime.connected && taskIds.length > 0) {
            const clearP = [];
            for (const id of taskIds) {
                debug(`Clearing ${id}`);
                clearP.push(this.writeCore(id, null));
            }
            await Promise.all(clearP);

            // All registers should be null now.
            for (const id of taskIds) {
                assert.equal(this.getTaskClientId(id), null, `${id} was not cleared`);
                debug(`Cleared ${id}`);
            }
        }
    }

    private getTaskClientId(id: string): string | null | undefined {
        return this.scheduler.read(id);
    }

    private async writeCore(key: string, value: string | null): Promise<void> {
        return this.scheduler.write(key, value);
    }
}
