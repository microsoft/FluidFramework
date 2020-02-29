/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import {
    IComponent,
    IComponentHandle,
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { LoaderHeader } from "@microsoft/fluid-container-definitions";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { ConsensusRegisterCollection } from "@microsoft/fluid-register-collection";
import {
    IAgentScheduler,
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
    ITask,
    ITaskManager,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import * as debug from "debug";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";

const LeaderTaskId = "leader";

// Note: making sure this ID is unique and does not collide with storage provided clientID
const UnattachedClientId = `${uuid()}_unattached`;

class AgentScheduler extends EventEmitter implements IAgentScheduler, IComponent, IComponentRouter {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        let root: ISharedMap;
        let scheduler: ConsensusRegisterCollection<string | null>;
        if (!runtime.existing) {
            root = SharedMap.create(runtime, "root");
            root.register();
            scheduler = ConsensusRegisterCollection.create(runtime);
            scheduler.register();
            root.set("scheduler", scheduler.handle);
        } else {
            root = await runtime.getChannel("root") as ISharedMap;
            const handle = await root.wait<IComponentHandle>("scheduler");
            scheduler = await handle.get<ConsensusRegisterCollection<string | null>>();
        }
        const agentScheduler = new AgentScheduler(runtime, context, scheduler);
        agentScheduler.initialize();

        return agentScheduler;
    }

    public get IComponentLoadable() { return this; }
    public get IAgentScheduler() { return this; }
    public get IComponentRouter() { return this; }

    private get clientId(): string {
        if (!this.runtime.isAttached) {
            return UnattachedClientId;
        }
        const clientId = this.runtime.clientId;
        assert(clientId);
        return clientId as string;
    }

    public url = "/_tasks";

    private _leader = false;

    // List of all tasks client is capable of running (essentially expressed desire to run)
    // Client will proactively attempt to pick them up these tasks if they are not assigned to other clients.
    // This is a strict superset of tasks running in the client.
    private readonly localTasks = new Map<string, () => Promise<void>>();

    // Set of registered tasks by this client.
    // Tasks in this set may or may not overlap with localTasks.
    // The only requirement here - a task can be registered by a client only once.
    private readonly registeredTasks = new Set<string>();

    // Set of registered tasks client is running.
    private runningTasks = new Set<string>();

    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly context: IComponentContext,
        private readonly scheduler: ConsensusRegisterCollection<string | null>) {

        super();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }

    public get leader(): boolean {
        return this._leader;
    }

    public async register(...taskUrls: string[]): Promise<void> {
        for (const taskUrl of taskUrls) {
            if (this.registeredTasks.has(taskUrl)) {
                return Promise.reject(`${taskUrl} is already registered`);
            }
        }
        const unregisteredTasks: string[] = [];
        for (const taskUrl of taskUrls) {
            this.registeredTasks.add(taskUrl);
            // Only register for a new task.
            const currentClient = this.getTaskClientId(taskUrl);
            if (currentClient === undefined) {
                unregisteredTasks.push(taskUrl);
            }
        }
        return this.registerCore(unregisteredTasks);
    }

    public async pick(taskId: string, worker: boolean): Promise<void> {
        return this.pickCore(taskId, async () => this.runTask(taskId, worker));
    }

    public async pickCore(taskId: string, worker: () => Promise<void>): Promise<void> {
        if (this.localTasks.has(taskId)) {
            return Promise.reject(`${taskId} is already attempted`);
        }
        this.localTasks.set(taskId, worker);

        // Check the current status and express interest if it's a new one (undefined) or currently unpicked (null).
        if (this.isActive()) {
            const currentClient = this.getTaskClientId(taskId);
            if (currentClient === undefined || currentClient === null) {
                debug(`Requesting ${taskId}`);
                await this.writeCore(taskId, this.clientId);
            }
        }
    }

    public async release(...taskUrls: string[]): Promise<void> {
        const active = this.isActive();
        for (const taskUrl of taskUrls) {
            if (!this.localTasks.has(taskUrl)) {
                return Promise.reject(`${taskUrl} was never registered`);
            }
            // Note - the assumption is - we are connected.
            // If not - all tasks should have been dropped already on disconnect / attachment
            assert(active);
            if (this.getTaskClientId(taskUrl) !== this.clientId) {
                return Promise.reject(`${taskUrl} was never picked`);
            }
        }
        return this.releaseCore([...taskUrls]);
    }

    public pickedTasks(): string[] {
        return Array.from(this.runningTasks.values());
    }

    private async registerCore(taskUrls: string[]): Promise<void> {
        if (taskUrls.length > 0) {
            const registersP: Promise<boolean>[] = [];
            for (const taskUrl of taskUrls) {
                debug(`Registering ${taskUrl}`);
                // tslint:disable no-null-keyword
                registersP.push(this.writeCore(taskUrl, null));
            }
            await Promise.all(registersP);

            // The registers should have up to date results now. Check the status.
            for (const taskUrl of taskUrls) {
                const taskStatus = this.getTaskClientId(taskUrl);

                // Task should be either registered (null) or picked up.
                assert(taskStatus !== undefined, `Unsuccessful registration`);

                if (taskStatus === null) {
                    debug(`Registered ${taskUrl}`);
                } else {
                    debug(`${taskStatus} is running ${taskUrl}`);
                }
            }
        }
    }

    private async releaseCore(taskUrls: string[]) {
        if (taskUrls.length > 0) {
            const releasesP: Promise<boolean>[] = [];
            for (const taskUrl of taskUrls) {
                debug(`Releasing ${taskUrl}`);
                // Remove from local map so that it can be picked later.
                this.localTasks.delete(taskUrl);
                releasesP.push(this.writeCore(taskUrl, null));
            }
            await Promise.all(releasesP);
        }
    }

    private async clearTasks(taskUrls: string[]) {
        assert(this.isActive());
        const clearP: Promise<boolean>[] = [];
        for (const taskUrl of taskUrls) {
            debug(`Clearing ${taskUrl}`);
            clearP.push(this.writeCore(taskUrl, null));
        }
        await Promise.all(clearP);
    }

    private getTaskClientId(url: string): string | null | undefined {
        return this.scheduler.read(url);
    }

    private async writeCore(key: string, clientId: string | null): Promise<boolean> {
        return this.scheduler.write(key, clientId);
    }

    private initialize() {
        const quorum = this.runtime.getQuorum();
        // A client left the quorum. Iterate and clear tasks held by that client.
        // Ideally a leader should do this cleanup. But it's complicated when a leader itself leaves.
        // Probably okay for now to have every client try to do this.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        quorum.on("removeMember", async (clientId: string) => {
            assert(this.runtime.isAttached);
            // Cleanup only if connected. If not, cleanup will happen in initializeCore() that runs on connection.
            if (this.isActive()) {
                const leftTasks: string[] = [];
                for (const taskUrl of this.scheduler.keys()) {
                    if (this.getTaskClientId(taskUrl) === clientId) {
                        leftTasks.push(taskUrl);
                    }
                }
                await this.clearTasks(leftTasks);
            }
        });

        // Listeners for new/released tasks. All clients will try to grab at the same time.
        // May be we want a randomized timer (Something like raft) to reduce chattiness?
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.scheduler.on("atomicChanged", async (key: string, currentClient: string | null) => {
            // Check if this client was chosen.
            if (this.isActive() && currentClient === this.clientId) {
                this.onNewTaskAssigned(key);
            } else {
                await this.onTaskReasigned(key, currentClient);
            }
        });

        this.setupLeadership();

        if (this.isActive()) {
            this.initializeCore();
        }

        this.runtime.on("connected", () => {
            assert(this.isActive());
            this.initializeCore();
        });

        if (!this.runtime.isAttached) {
            this.runtime.waitAttached().then(() => {
                this.clearLocalTasks();
            }).catch((error) => {
                this.sendErrorEvent("AgentScheduler_ClearLocalTasks", error);
            });
        }

        this.runtime.on("disconnected", () => {
            if (this.runtime.isAttached) {
                this.clearLocalTasks();
            }
        });
    }

    private onNewTaskAssigned(key: string) {
        assert(!this.runningTasks.has(key), "task is already running");
        this.runningTasks.add(key);
        const worker = this.localTasks.get(key);
        if (worker === undefined) {
            this.sendErrorEvent("AgentScheduler_UnwantedChange", undefined, key);
        }
        else {
            this.emit("picked", key);
            worker().catch((error) => {
                this.sendErrorEvent("AgentScheduler_FailedWork", error, key);
            });
        }
    }

    private async onTaskReasigned(key: string, currentClient: string | null) {
        if (this.runningTasks.has(key)) {
            this.runningTasks.delete(key);
            this.emit("released", key);
        }
        assert(currentClient !== undefined, "client is undefined");
        if (this.isActive()) {
            // attempt to pick up task if we are connected.
            // If not, initializeCore() will do it when connected
            if (currentClient === null) {
                if (this.localTasks.has(key)) {
                    debug(`Requesting ${key}`);
                    await this.writeCore(key, this.clientId);
                }
            }
            // Check if the op came from dropped client
            // This could happen when "old" ops are submitted on reconnection.
            // They carry "old" ref seq number, but if write is not contested, it will get accepted
            else if (this.runtime.getQuorum().getMember(currentClient) === undefined) {
                await this.writeCore(key, null);
            }
        }
    }

    private setupLeadership() {
        // Each client expresses interest to be a leader.
        this.pickCore(LeaderTaskId, async () => {
            assert(!this._leader);
            this._leader = true;
            this.emit("leader");
        }).catch((error) => {
            this.sendErrorEvent("AgentScheduler_LeaderInit", error);
        });

        this.on("released", (key) => {
            if (key === LeaderTaskId) {
                assert(this._leader);
                this._leader = false;
                this.emit("notleader");
            }
        });
    }

    private isActive() {
        if (!this.runtime.isAttached) {
            return true;
        }
        if (!this.runtime.connected) {
            return false;
        }
        const readonly = this.context.hostRuntime.deltaManager.readonly;
        // Once we are connected, we have to know if we have r/w access or not!
        assert(readonly !== undefined);
        return readonly === false;
    }

    private initializeCore() {
        // Nobody released the tasks held by last client in previous session.
        // Check to see if this client needs to do this.
        const clearCandidates: string[] = [];
        const tasks: Promise<any>[] = [];

        for (const [taskUrl] of this.localTasks) {
            if (!this.getTaskClientId(taskUrl)) {
                debug(`Requesting ${taskUrl}`);
                tasks.push(this.writeCore(taskUrl, this.clientId));
            }
        }

        for (const taskUrl of this.scheduler.keys()) {
            const currentClient = this.getTaskClientId(taskUrl);
            if (currentClient && this.runtime.getQuorum().getMember(currentClient) === undefined) {
                clearCandidates.push(taskUrl);
            }
        }

        tasks.push(this.clearTasks(clearCandidates));

        Promise.all(tasks).catch((error) => {
            this.sendErrorEvent("AgentScheduler_InitError", error);
        });
    }

    private async runTask(url: string, worker: boolean) {
        const request: IRequest = {
            headers: {
                [LoaderHeader.cache]: false,
                [LoaderHeader.clientDetails]: {
                    capabilities: { interactive: false },
                    type: "agent",
                },
                [LoaderHeader.reconnect]: false,
                [LoaderHeader.sequenceNumber]: this.context.deltaManager.referenceSequenceNumber,
                [LoaderHeader.executionContext]: worker ? "worker" : undefined,
            },
            url,
        };
        const response = await this.runtime.loader.request(request);
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return Promise.reject(`Invalid agent route: ${url}`);
        }

        const rawComponent = response.value as IComponent;
        const agent = rawComponent.IComponentRunnable;
        if (agent === undefined) {
            return Promise.reject("Component does not implement IComponentRunnable");
        }

        return agent.run();
    }

    private clearLocalTasks() {
        const tasks = this.runningTasks;
        this.runningTasks = new Set<string>();

        if (this.isActive()) {
            // Clear all tasks with UnattachedClientId (if was unattached) and reapply for tasks with new clientId
            // If we are simply disconnected, then proper cleanup will be done on connection.
            this.initializeCore();
        }

        for (const task of tasks) {
            this.emit("released", task);
        }
    }

    private sendErrorEvent(eventName: string, error: any, key?: string) {
        this.runtime.logger.sendErrorEvent({eventName, key}, error);
    }
}

export class TaskManager implements ITaskManager {

    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<TaskManager> {
        const agentScheduler = await AgentScheduler.load(runtime, context);
        return new TaskManager(agentScheduler, context);
    }

    public get IAgentScheduler() { return this.scheduler; }
    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get ITaskManager() { return this; }

    public get url() { return this.scheduler.url; }

    private readonly taskMap = new Map<string, IComponentRunnable>();
    constructor(private readonly scheduler: IAgentScheduler, private readonly context: IComponentContext) {

    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url === "" || request.url === "/") {
            return { status: 200, mimeType: "fluid/component", value: this };
        } else if (!request.url.startsWith(this.url)) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        } else {
            const trimmedUrl = request.url.substr(this.url.length);
            const taskUrl = trimmedUrl.length > 0 && trimmedUrl.startsWith("/")
                ? trimmedUrl.substr(1)
                : "";
            if (taskUrl === "" || !this.taskMap.has(taskUrl)) {
                return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
            } else {
                return { status: 200, mimeType: "fluid/component", value: this.taskMap.get(taskUrl) };
            }
        }
    }

    public register(...tasks: ITask[]): void {
        for (const task of tasks) {
            this.taskMap.set(task.id, task.instance);
        }
    }

    public async pick(componentUrl: string, taskId: string, worker?: boolean): Promise<void> {
        const configuration = (this.context.hostRuntime as IComponent).IComponentConfiguration;
        if (configuration && !configuration.canReconnect) {
            return Promise.reject("Picking not allowed on secondary copy");
        } else {
            const urlWithSlash = componentUrl.startsWith("/") ? componentUrl : `/${componentUrl}`;
            return this.scheduler.pick(
                `${urlWithSlash}${this.url}/${taskId}`,
                worker !== undefined ? worker : false);
        }
    }
}

export class AgentSchedulerFactory implements IComponentFactory {

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const mapFactory = SharedMap.getFactory();
        const consensusRegisterCollectionFactory = ConsensusRegisterCollection.getFactory();
        const dataTypes = new Map<string, ISharedObjectFactory>();
        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(consensusRegisterCollectionFactory.type, consensusRegisterCollectionFactory);

        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                const taskManagerP = TaskManager.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const taskManager = await taskManagerP;
                    return taskManager.request(request);
                });
            });
    }
}
