/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { assert } from "@fluidframework/common-utils";
import {
    IFluidObject,
    IFluidHandle,
    IFluidRunnable,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import { LoaderHeader, AttachState } from "@fluidframework/container-definitions";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import {
    IAgentScheduler,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    ITask,
    ITaskManager,
    NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions";
import debug from "debug";
import { v4 as uuid } from "uuid";

// Note: making sure this ID is unique and does not collide with storage provided clientID
const UnattachedClientId = `${uuid()}_unattached`;

class AgentScheduler extends EventEmitter implements IAgentScheduler {
    public static async load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext) {
        let root: ISharedMap;
        let scheduler: ConsensusRegisterCollection<string | null>;
        if (!runtime.existing) {
            root = SharedMap.create(runtime, "root");
            root.bindToContext();
            scheduler = ConsensusRegisterCollection.create(runtime);
            scheduler.bindToContext();
            root.set("scheduler", scheduler.handle);
        } else {
            root = await runtime.getChannel("root") as ISharedMap;
            const handle = await root.wait<IFluidHandle<ConsensusRegisterCollection<string | null>>>("scheduler");
            assert(handle !== undefined);
            scheduler = await handle.get();
        }
        const agentScheduler = new AgentScheduler(runtime, context, scheduler);
        agentScheduler.initialize();

        return agentScheduler;
    }

    public get IAgentScheduler() { return this; }

    private get clientId(): string {
        if (this.runtime.attachState === AttachState.Detached) {
            return UnattachedClientId;
        }
        const clientId = this.runtime.clientId;
        assert(!!clientId);
        return clientId;
    }

    // Set of tasks registered by this client.
    // Has no relationship with lists below.
    // The only requirement here - a task can be registered by a client only once.
    // Other clients can pick these tasks.
    private readonly registeredTasks = new Set<string>();

    // List of all tasks client is capable of running (essentially expressed desire to run)
    // Client will proactively attempt to pick them up these tasks if they are not assigned to other clients.
    // This is a strict superset of tasks running in the client.
    private readonly locallyRunnableTasks = new Map<string, () => Promise<void>>();

    // Set of registered tasks client is currently running.
    // It's subset of this.locallyRunnableTasks
    private runningTasks = new Set<string>();

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly context: IFluidDataStoreContext,
        private readonly scheduler: ConsensusRegisterCollection<string | null>) {
        super();
    }

    public async register(...taskUrls: string[]): Promise<void> {
        for (const taskUrl of taskUrls) {
            if (this.registeredTasks.has(taskUrl)) {
                return Promise.reject(new Error(`${taskUrl} is already registered`));
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

    public async pick(taskId: string, worker: () => Promise<void>): Promise<void> {
        if (this.locallyRunnableTasks.has(taskId)) {
            return Promise.reject(new Error(`${taskId} is already attempted`));
        }
        this.locallyRunnableTasks.set(taskId, worker);

        // Note: we are not checking for this.context.deltaManager.clientDetails.capabilities.interactive
        // in isActive(). This check is done by users of this class - containerRuntime.ts (for "leader") and
        // TaskManager. In the future, as new usage shows up, we may need to reconsider that.
        // I'm adding assert here to catch that case and make decision on which way we go - push requirements
        // to consumers to make a choice, or centrally make this call here.
        assert(this.context.deltaManager.clientDetails.capabilities.interactive);

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
            if (!this.locallyRunnableTasks.has(taskUrl)) {
                return Promise.reject(new Error(`${taskUrl} was never registered`));
            }
            // Note - the assumption is - we are connected.
            // If not - all tasks should have been dropped already on disconnect / attachment
            assert(active);
            if (this.getTaskClientId(taskUrl) !== this.clientId) {
                return Promise.reject(new Error(`${taskUrl} was never picked`));
            }
        }
        return this.releaseCore([...taskUrls]);
    }

    public pickedTasks(): string[] {
        return Array.from(this.runningTasks.values());
    }

    private async registerCore(taskUrls: string[]): Promise<void> {
        if (taskUrls.length > 0) {
            const registersP: Promise<void>[] = [];
            for (const taskUrl of taskUrls) {
                debug(`Registering ${taskUrl}`);
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
            const releasesP: Promise<void>[] = [];
            for (const taskUrl of taskUrls) {
                debug(`Releasing ${taskUrl}`);
                // Remove from local map so that it can be picked later.
                this.locallyRunnableTasks.delete(taskUrl);
                releasesP.push(this.writeCore(taskUrl, null));
            }
            await Promise.all(releasesP);
        }
    }

    private async clearTasks(taskUrls: string[]) {
        assert(this.isActive());
        const clearP: Promise<void>[] = [];
        for (const taskUrl of taskUrls) {
            debug(`Clearing ${taskUrl}`);
            clearP.push(this.writeCore(taskUrl, null));
        }
        await Promise.all(clearP);
    }

    private getTaskClientId(url: string): string | null | undefined {
        return this.scheduler.read(url);
    }

    private async writeCore(key: string, clientId: string | null): Promise<void> {
        await this.scheduler.write(key, clientId);
    }

    private initialize() {
        const quorum = this.runtime.getQuorum();
        // A client left the quorum. Iterate and clear tasks held by that client.
        // Ideally a leader should do this cleanup. But it's complicated when a leader itself leaves.
        // Probably okay for now to have every client try to do this.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        quorum.on("removeMember", async (clientId: string) => {
            assert(this.runtime.objectsRoutingContext.isAttached);
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
                await this.onTaskReassigned(key, currentClient);
            }
        });

        if (this.isActive()) {
            this.initializeCore();
        }

        this.runtime.on("connected", () => {
            if (this.isActive()) {
                this.initializeCore();
            }
        });

        if (this.runtime.attachState === AttachState.Detached) {
            this.runtime.waitAttached().then(() => {
                this.clearRunningTasks();
            }).catch((error) => {
                this.sendErrorEvent("AgentScheduler_clearRunningTasks", error);
            });
        }

        this.runtime.on("disconnected", () => {
            if (this.runtime.attachState !== AttachState.Detached) {
                this.clearRunningTasks();
            }
        });
    }

    private onNewTaskAssigned(key: string) {
        assert(!this.runningTasks.has(key), "task is already running");
        this.runningTasks.add(key);
        const worker = this.locallyRunnableTasks.get(key);
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

    private async onTaskReassigned(key: string, currentClient: string | null) {
        if (this.runningTasks.has(key)) {
            this.runningTasks.delete(key);
            this.emit("released", key);
        }
        assert(currentClient !== undefined, "client is undefined");
        if (this.isActive()) {
            // attempt to pick up task if we are connected.
            // If not, initializeCore() will do it when connected
            if (currentClient === null) {
                if (this.locallyRunnableTasks.has(key)) {
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

    private isActive() {
        // Scheduler should be active in detached container.
        if (this.runtime.attachState === AttachState.Detached) {
            return true;
        }
        if (!this.runtime.connected) {
            return false;
        }

        // Note: we are not checking for this.context.deltaManager.clientDetails.capabilities.interactive
        // here. This is done by users of this class - containerRuntime.ts (for "leader") and TaskManager.
        // In the future, as new usage shows up, we may need to reconsider that.
        // I'm adding assert in pick() to catch that case and make decision on which way we go - push requirements
        // to consumers to make a choice, or centrally make this call here.

        return this.context.deltaManager.active;
    }

    private initializeCore() {
        // Nobody released the tasks held by last client in previous session.
        // Check to see if this client needs to do this.
        const clearCandidates: string[] = [];
        const tasks: Promise<any>[] = [];

        for (const [taskUrl] of this.locallyRunnableTasks) {
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

    private clearRunningTasks() {
        const tasks = this.runningTasks;
        this.runningTasks = new Set<string>();

        if (this.isActive()) {
            // Clear all tasks with UnattachedClientId (if was unattached) and reapply for tasks with new clientId
            // If we are simply disconnected, then proper cleanup will be done on connection.
            this.initializeCore();
        }

        for (const task of tasks) {
            this.emit("lost", task);
        }
    }

    private sendErrorEvent(eventName: string, error: any, key?: string) {
        this.runtime.logger.sendErrorEvent({ eventName, key }, error);
    }
}

export class TaskManager implements ITaskManager {
    public static async load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext): Promise<TaskManager> {
        const agentScheduler = await AgentScheduler.load(runtime, context);
        return new TaskManager(agentScheduler, runtime, context);
    }

    private readonly innerHandle: IFluidHandle<this>;

    public get IAgentScheduler() { return this.scheduler; }
    public get handle(): IFluidHandle<this> { return this.innerHandle; }
    public get IFluidHandle() { return this.innerHandle; }
    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }
    public get ITaskManager() { return this; }

    protected readonly taskUrl = "_tasks";

    private readonly taskMap = new Map<string, IFluidRunnable>();
    constructor(
        private readonly scheduler: IAgentScheduler,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly context: IFluidDataStoreContext) {
        this.innerHandle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url === "" || request.url === "/") {
            return { status: 200, mimeType: "fluid/object", value: this };
        } else if (!request.url.startsWith(this.taskUrl)) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        } else {
            const trimmedUrl = request.url.substr(this.taskUrl.length);
            const taskUrl = trimmedUrl.length > 0 && trimmedUrl.startsWith("/")
                ? trimmedUrl.substr(1)
                : "";
            if (taskUrl === "" || !this.taskMap.has(taskUrl)) {
                return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
            } else {
                return { status: 200, mimeType: "fluid/object", value: this.taskMap.get(taskUrl) };
            }
        }
    }

    /**
     * {@inheritDoc ITaskManager.register}
     */
    public register(...tasks: ITask[]): void {
        for (const task of tasks) {
            this.taskMap.set(task.id, task.instance);
        }
    }

    /**
     * {@inheritDoc ITaskManager.pick}
     */
    public async pick(taskId: string, worker?: boolean): Promise<void> {
        if (!this.context.deltaManager.clientDetails.capabilities.interactive) {
            return Promise.reject(new Error("Picking not allowed on secondary copy"));
        } else if (this.runtime.attachState !== AttachState.Attached) {
            return Promise.reject(new Error("Picking not allowed in detached container in task manager"));
        } else {
            const fullUrl = `/${this.runtime.id}/${this.taskUrl}/${taskId}`;
            return this.scheduler.pick(
                fullUrl,
                async () => this.runTask(fullUrl, worker !== undefined ? worker : false));
        }
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
                [LoaderHeader.sequenceNumber]: this.context.deltaManager.lastSequenceNumber,
                [LoaderHeader.executionContext]: worker ? "worker" : undefined,
            },
            url,
        };
        const response = await this.runtime.loader.request(request);
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            return Promise.reject(new Error(`Invalid agent route: ${url}`));
        }

        const fluidObject = response.value as IFluidObject;
        const agent = fluidObject.IFluidRunnable;
        if (agent === undefined) {
            return Promise.reject(new Error("Fluid object does not implement IFluidRunnable"));
        }

        return agent.run();
    }
}

export class TaskManagerFactory implements IFluidDataStoreFactory {
    public static readonly type = "_scheduler";
    public readonly type = TaskManagerFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    public static get registryEntry(): NamedFluidDataStoreRegistryEntry {
        return [this.type, Promise.resolve(new TaskManagerFactory())];
    }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        const mapFactory = SharedMap.getFactory();
        const consensusRegisterCollectionFactory = ConsensusRegisterCollection.getFactory();
        const dataTypes = new Map<string, IChannelFactory>();
        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(consensusRegisterCollectionFactory.type, consensusRegisterCollectionFactory);

        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const router = await routerP;
                return router.request(request);
            });

        const runtime = new runtimeClass(context, dataTypes);
        const routerP = TaskManager.load(runtime, context);

        return runtime;
    }
}
