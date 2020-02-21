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
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
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
            const handle = await root.wait<IComponentHandle>("scheduler");
            scheduler = await handle.get<ConsensusRegisterCollection<string | null>>();
        }
        const agentScheduler = new AgentScheduler(runtime, context, scheduler);
        agentScheduler.initialize().catch((err) => {
            debug(err as string);
        });

        return agentScheduler;
    }

    public get IComponentLoadable() { return this; }
    public get IAgentScheduler() { return this; }
    public get IComponentRouter() { return this; }

    public url = "_tasks";

    private _leader = false;

    // List of all tasks client is capable of running. This is a strict superset of tasks
    // running in the client.
    private readonly localTasks = new Map<string, boolean>();

    // Set of registered tasks client not capable of running.
    private readonly registeredTasks = new Set<string>();

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
        await this.waitForFullConnection();
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
        await this.waitForFullConnection();
        if (this.localTasks.has(taskId)) {
            return Promise.reject(`${taskId} is already attempted`);
        }

        this.localTasks.set(taskId, worker);
        // Check the current status and express interest if it's a new one (undefined) or currently unpicked (null).
        const currentClient = this.getTaskClientId(taskId);
        if (currentClient === undefined || currentClient === null) {
            await this.pickCore([taskId]);
        }
    }

    public async release(...taskUrls: string[]): Promise<void> {
        await this.waitForFullConnection();
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
                allPickedTasks.push(taskUrl);
            }
        }
        return allPickedTasks;
    }

    private async pickNewTasks(taskUrls: string[]) {
        if (this.runtime.connected) {
            const possibleTasks: string[] = [];
            for (const taskUrl of taskUrls) {
                if (this.localTasks.has(taskUrl)) {
                    possibleTasks.push(taskUrl);
                }
            }
            try {
                await this.pickCore(possibleTasks);
            } catch (err) {
                debug(err as string); // Just log the error. It will be attempted again.
            }
        }
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

    private async pickCore(taskUrls: string[]) {
        if (taskUrls.length > 0) {
            const picksP: Promise<boolean>[] = [];
            for (const taskUrl of taskUrls) {
                debug(`Requesting ${taskUrl}`);
                picksP.push(this.writeCore(taskUrl, this.runtime.clientId));
            }
            await Promise.all(picksP);

            // The registers should have up to date results now. Start the respective task if this client was chosen.
            const runningP: Promise<IComponentRunnable | void>[] = [];
            for (const taskUrl of taskUrls) {
                const pickedClientId = this.getTaskClientId(taskUrl);

                // At least one client should pick up.
                assert(pickedClientId, `No client was chosen for ${taskUrl}`);

                // Check if this client was chosen.
                if (pickedClientId === this.runtime.clientId) {
                    assert(this.localTasks.has(taskUrl), `Client did not try to pick ${taskUrl}`);

                    if (taskUrl !== LeaderTaskId) {
                        runningP.push(this.runTask(taskUrl, this.localTasks.get(taskUrl) as boolean));
                        debug(`Picked ${taskUrl}`);
                        this.emit("picked", taskUrl);
                    }
                } else {
                    debug(`${pickedClientId} is running ${taskUrl}`);
                }
            }
            return runningP;
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
                assert.equal(this.getTaskClientId(taskUrl), null, `${taskUrl} was not released`);
                debug(`Released ${taskUrl}`);
            }
        }
    }

    private async clearTasks(taskUrls: string[]) {
        if (this.runtime.connected && taskUrls.length > 0) {
            const clearP: Promise<boolean>[] = [];
            for (const taskUrl of taskUrls) {
                debug(`Clearing ${taskUrl}`);
                clearP.push(this.writeCore(taskUrl, null));
            }
            try {
                await Promise.all(clearP);
            } catch (err) {
                debug(err as string);
            }
        }
    }

    private getTaskClientId(url: string): string | null | undefined {
        return this.scheduler.read(url);
    }

    private async writeCore(key: string, value: string | null): Promise<boolean> {
        return this.scheduler.write(key, value);
    }

    private async initialize() {
        const configuration = (this.context.hostRuntime as IComponent).IComponentConfiguration;
        if (configuration === undefined || configuration.canReconnect) {
            await this.waitForFullConnection();

            const quorum = this.runtime.getQuorum();
            // A client left the quorum. Iterate and clear tasks held by that client.
            // Ideally a leader should do this cleanup. But it's complicated when a leader itself leaves.
            // Probably okay for now to have every client try to do this.
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            quorum.on("removeMember", async (clientId: string) => {
                if (this.context.hostRuntime.deltaManager.active) {
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
            this.scheduler.on("atomicChanged", async (key: string) => {
                if (this.context.hostRuntime.deltaManager.active) {
                    const currentClient = this.getTaskClientId(key);
                    // Either a client registered for a new task or released a running task.
                    if (currentClient === null) {
                        await this.pickNewTasks([key]);
                    }
                    // A new leader was picked. set leadership info.
                    if (key === LeaderTaskId && currentClient === this.runtime.clientId) {
                        this._leader = true;
                        this.emit("leader");
                    }
                }
            });

            await this.initializeCore();
            this.handleReconnection();
        }
    }

    // Ensures that runtime and scheduler is connected.
    private async waitForFullConnection(): Promise<void> {
        if (!this.runtime.connected) {
            // tslint:disable-next-line
            await new Promise<void>((resolve) => this.runtime.on("connected", () => resolve()));
        }
        if (this.scheduler.state !== ConnectionState.Connected) {
            // tslint:disable-next-line
            await new Promise<void>((resolve) => this.scheduler.on("connected", () => resolve()));
        }
    }

    private async initializeCore() {
        if (this.context.hostRuntime.deltaManager.active) {
            // Nobody released the tasks held by last client in previous session.
            // Check to see if this client needs to do this.
            const clearCandidates: string[] = [];
            for (const taskUrl of this.scheduler.keys()) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (!this.runtime.getQuorum().getMembers().has(this.getTaskClientId(taskUrl)!)) {
                    clearCandidates.push(taskUrl);
                }
            }
            await this.clearTasks(clearCandidates);

            // Each client expresses interest to be a leader.
            try {
                await this.pick(LeaderTaskId, false);

                // There must be a leader now.
                const leaderClientId = this.getTaskClientId(LeaderTaskId);
                assert(leaderClientId, "No leader present");
                this._leader = leaderClientId === this.runtime.clientId;
            } catch (err) {
                debug(err as string);
            }
        }
    }

    private handleReconnection() {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.runtime.on("connected", async () => {
            await this.waitForFullConnection();
            await this.initializeCore();
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
            return Promise.reject<IComponentRunnable>("Invalid agent route");
        }

        const rawComponent = response.value as IComponent;
        const agent = rawComponent.IComponentRunnable;
        if (agent === undefined) {
            return Promise.reject<IComponentRunnable>("Component does not implement IComponentRunnable");
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
            try {
                await this.scheduler.pick(
                    `${urlWithSlash}/${this.url}/${taskId}`,
                    worker !== undefined ? worker : false);
            } catch (err) {
                debug(err as string); // Just log the error. It will be attempted again.
            }
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
