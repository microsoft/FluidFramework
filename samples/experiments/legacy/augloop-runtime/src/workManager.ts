/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as agent from "@prague/routerlicious/dist/agent";
import { EventEmitter } from "events";
import * as winston from "winston";
import { AugLoopRuntime } from "./augloop-runtime";
import { AugmentationWork } from "./augmentationWork";

// Responsible for managing the lifetime of an work.
export class WorkManager extends EventEmitter implements agent.IWorkManager {

    private documentMap = new Map<string, agent.IWork>();
    private events = new EventEmitter();
    private augRuntime: AugLoopRuntime;

    constructor(private serviceFactory: agent.IDocumentServiceFactory, private config: any) {
        super();
        this.augRuntime = new AugLoopRuntime();
    }

    public async startDocumentWork(tenantId: string, documentId: string, workType: string, token: string) {
        const services = await this.serviceFactory.getService(tenantId);

        switch (workType) {
            case "augmentation":
                await this.augRuntime.initialize().catch((err) => {
                    winston.error(err);
                });
                const augmentationWork = new AugmentationWork(
                    tenantId,
                    documentId,
                    token,
                    this.config,
                    services,
                    this.augRuntime);
                await this.startTask(tenantId, documentId, workType, augmentationWork);
                break;
            default:
                throw new Error("Unknown work type!");
        }

    }

    public async stopDocumentWork(tenantId: string, documentId: string, workType: string) {
        const fullId = this.getFullId(tenantId, documentId, workType);
        if (this.documentMap.has(fullId)) {
            const task = this.documentMap.get(fullId);
            await this.stopTask(task);
            this.documentMap.delete(fullId);
        }
    }

    public async loadAgent(agentName: string): Promise<void> {
        // No implementation needed
    }

    public unloadAgent(agentName: string) {
        // No implementation needed
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    private getFullId(tenantId: string, documentId: string, workType: string): string {
        return `${tenantId}/${documentId}/${workType}`;
    }

    private async startTask(tenantId: string, documentId: string, workType: string, worker: agent.IWork) {
        const fullId = this.getFullId(tenantId, documentId, workType);

        if (!this.documentMap.has(fullId) && worker) {
            this.documentMap.set(fullId, worker);
            await this.applyWork(fullId, workType, worker);
        }
    }

    private async stopTask(task: agent.IWork) {
        if (task) {
            task.removeListeners();
            await task.stop();
        }
    }

    private async applyWork(fullId: string, workType: string, worker: agent.IWork) {
        await worker.start(workType);
        console.log(`Started work ${workType} for document ${fullId}`);
        // Listen for errors and future stop events.
        worker.on("error", (error) => {
            this.events.emit("error", error);
        });
        worker.on("stop", (ev: agent.IDocumentTaskInfo) => {
            this.events.emit("stop", ev);
        });
    }
}
