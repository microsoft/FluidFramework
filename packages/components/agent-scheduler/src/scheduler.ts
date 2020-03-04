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

const LeaderTaskId = "leader";

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
            const handle = await root.wait<IComponentHandle<ConsensusRegisterCollection<string | null>>>("scheduler");
            scheduler = await handle.get();
        }
        const agentScheduler = new AgentScheduler(runtime, context, scheduler);
        agentScheduler.initialize();

        return agentScheduler;
    }

    public get IComponentLoadable() { return this; }
    public get IAgentScheduler() { return this; }
    public get IComponentRouter() { return this; }

    public url = "_tasks";

    private _leader = false;

    // List of all tasks client is capable of running. This is a strict superset of tasks
    // running in the client.
    private readonly localTasks = new Map<string, () => Promise<void>>();

    // Set of registered tasks client not capable of running.
    private readonly registeredTasks = new Set<string>();

    // Set of registered tasks client not capable of running.
    private readonly runningTasks = new Set<string>();

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
        const currentClient = this.getTaskClientId(taskId);
        if (currentClient === undefined || currentClient === null) {
            debug(`Requesting ${taskId}`);
            await this.writeCore(taskId, this.runtime.clientId);
        }
    }

    public async release(...taskUrls: string[]): Promise<void> {
        for (const taskUrl of taskUrls) {
            if (!this.localTasks.has(taskUrl)) {
                return Promise.reject(`${taskUrl} was never registered`);
            }
            if (this.getTaskClientId(taskUrl) !== this.runtime.clientId) {
                return Promise.reject(`${taskUrl} was never picked`);
            }
        }
        return this.releaseCore([...taskUrls]);
    }

    public pickedTasks(): string[] {
        const allPickedTasks: string[] = [];
        for (const taskUrl of this.scheduler.keys()) {
            if (this.getTaskClientId(taskUrl) === this.runtime.clientId) {
                assert(this.runningTasks.has(taskUrl));
                allPickedTasks.push(taskUrl);
            }
        }
        assert(allPickedTasks.length === this.runningTasks.size);
        return allPickedTasks;
    }

    private async pickNewTasks(taskUrls: string[]) {
        assert(this.isActive());
        const picksP: Promise<boolean>[] = [];
        for (const taskUrl of taskUrls) {
            if (this.localTasks.has(taskUrl)) {
                debug(`Requesting ${taskUrl}`);
                picksP.push(this.writeCore(taskUrl, this.runtime.clientId));
            }
        }
        await Promise.all(picksP);
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

            // Releases are not contested by definition. So every id should have null value now.
            for (const taskUrl of taskUrls) {
                assert.notEqual(this.getTaskClientId(taskUrl), this.runtime.clientId, `${taskUrl} was not released`);
                debug(`Released ${taskUrl}`);
            }
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

    private async writeCore(key: string, value: string | null): Promise<boolean> {
        return this.scheduler.write(key, value);
    }

    private initialize() {
        const configuration = (this.context.hostRuntime as IComponent).IComponentConfiguration;
        if (configuration === undefined || configuration.canReconnect) {
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
            this.scheduler.on("atomicChanged", async (key: string, currentClient: string) => {
                // Check if this client was chosen.
                if (currentClient === this.runtime.clientId) {
                    assert(!this.runningTasks.has(key));
                    this.runningTasks.add(key);

                    const worker = this.localTasks.get(key);
                    if (worker === undefined) {
                        throw new Error(`Client did not try to pick ${key}`);
                    }

                    this.emit("picked", key);
                    await worker().catch((error) => {
                        debug(error as string);
                    });
                } else {
                    if (this.runningTasks.has(key)) {
                        this.runningTasks.delete(key);
                        this.emit("released", key);
                    }
                    // attempt to pick up task if we are connected.
                    // If not, initializeCore() will do it when connected
                    if (currentClient === null && this.isActive()) {
                        await this.pickNewTasks([key]);
                    }
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
        }
    }

    private setupLeadership() {
        // Each client expresses interest to be a leader.
        this.pickCore(LeaderTaskId, async () => {
            assert(!this._leader);
            this._leader = true;
            this.emit("leader");
        }).catch((error) => {
            this.runtime.logger.sendErrorEvent({eventName: "AgentScheduleLeaderInit"}, error);
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
        return this.runtime.connected && this.context.hostRuntime.deltaManager.active ||
            !this.runtime.isAttached;
    }

    private initializeCore() {
        // Nobody released the tasks held by last client in previous session.
        // Check to see if this client needs to do this.
        const clearCandidates: string[] = [];
        const newTasks: string[] = [];
        for (const taskUrl of this.scheduler.keys()) {
            const currentClient = this.getTaskClientId(taskUrl);
            if (!currentClient) {
                newTasks.push(taskUrl);
            } else if (this.runtime.getQuorum().getMember(currentClient) === undefined) {
                clearCandidates.push(taskUrl);
            }
        }
        Promise.all([this.clearTasks(clearCandidates), this.pickNewTasks(newTasks)]).catch((error) => {
            this.runtime.logger.sendErrorEvent({eventName: "AgentSchedulerInitError"}, error);
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
            return Promise.reject("Invalid agent route");
        }

        const rawComponent = response.value as IComponent;
        const agent = rawComponent.IComponentRunnable;
        if (agent === undefined) {
            return Promise.reject("Component does not implement IComponentRunnable");
        }

        return agent.run();
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
                `${urlWithSlash}/${this.url}/${taskId}`,
                worker !== undefined ? worker : false);
        }
    }
}

export class AgentSchedulerFactory implements IComponentFactory {

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext) {
        const mapFactory = SharedMap.getFactory();
        const consensusRegisterCollectionFactory = ConsensusRegisterCollection.getFactory();
        const dataTypes = new Map<string, ISharedObjectFactory>();
        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(consensusRegisterCollectionFactory.type, consensusRegisterCollectionFactory);

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const taskManagerP = TaskManager.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const taskManager = await taskManagerP;
            return taskManager.request(request);
        });

        return runtime;
    }
}
