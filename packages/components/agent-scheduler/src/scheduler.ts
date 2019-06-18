import { ComponentRuntime } from "@prague/component-runtime";
import { ConsensusRegisterCollection, IConsensusRegisterCollection } from "@prague/consensus-register-collection";
import { IComponent, IComponentRouter, IRequest, IResponse } from "@prague/container-definitions";
import { ISharedMap, SharedMap } from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import * as assert from "assert";
import * as debug from "debug";
import { EventEmitter } from "events";
import { IAgentScheduler, ITask } from "./interfaces";

interface IChanged {
    key: string;
}

const LeaderTaskId = "leader";

export class AgentScheduler extends EventEmitter implements IAgentScheduler, IComponent, IComponentRouter {

    public static supportedInterfaces = ["IAgentScheduler"];

    public static async load(runtime: IComponentRuntime) {
        const collection = new AgentScheduler(runtime);
        await collection.initialize();

        return collection;
    }

    private root: ISharedMap;
    private scheduler: IConsensusRegisterCollection;

    // tslint:disable-next-line:variable-name private fields exposed via getters
    private _leader = false;

    // List of all tasks client is capable of running. This is a strict superset of tasks
    // running in the client.
    private readonly localTaskMap = new Map<string, () => void>();

    // Set of registered tasks client not capable of running.
    private readonly registeredTasks = new Set<string>();

    constructor(private readonly runtime: IComponentRuntime) {
        super();
    }

    public query(id: string): any {
        return AgentScheduler.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return AgentScheduler.supportedInterfaces;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
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

                    // invoke the associated callback if present.
                    if (task.callback) {
                        task.callback();
                    }
                    debug(`Picked ${task.id}`);
                    this.emit("picked", task.id);
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
        }
    }

    private getTaskClientId(id: string): string | null | undefined {
        return this.scheduler.read(id);
    }

    private async writeCore(key: string, value: string | null): Promise<void> {
        return this.scheduler.write(key, value);
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.attach();
            this.scheduler = ConsensusRegisterCollection.create(this.runtime, "scheduler");
            this.scheduler.attach();
            this.root.set("scheduler", this.scheduler);
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
            this.scheduler = await this.root.wait<ConsensusRegisterCollection>("scheduler");
        }

        if (!this.runtime.connected) {
            // tslint:disable-next-line
            await new Promise<void>((resolve) => this.runtime.on("connected", () => resolve()));
        }

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
        this.scheduler.on("atomicChanged", async (changed: IChanged) => {
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
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {

    const mapExtension = SharedMap.getFactory();
    const consensusRegisterCollectionExtension = ConsensusRegisterCollection.getFactory();
    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(mapExtension.type, mapExtension);
    dataTypes.set(consensusRegisterCollectionExtension.type, consensusRegisterCollectionExtension);

    const runtime = await ComponentRuntime.load(context, dataTypes);
    const agentSchedulerP = AgentScheduler.load(runtime);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const agentScheduler = await agentSchedulerP;
        return agentScheduler.request(request);
    });

    return runtime;
}
