/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as fs from "node:fs";

import * as yaml from "js-yaml";
import { v4 as uuid } from "uuid";

import { PerformanceEvent } from "@fluidframework/telemetry-utils";

import { AzureClientRunner, AzureClientRunnerConfig } from "./AzureClientRunner";
import { DocCreatorConfig, DocCreatorRunner } from "./DocCreatorRunner";
import { MapTrafficRunner, MapTrafficRunnerConfig } from "./MapTrafficRunner";
import { IRunner } from "./interface";
import { getLogger } from "./logger";

export interface IStageParams {
    [key: string]: unknown;
}
export interface IEnvVars {
    [key: string]: unknown;
}
export interface IStage {
    id: number;
    description?: string;
    name: string;
    package: string;
    params: IStageParams;
    out: string;
}

export interface RunConfig {
    title: string;
    description: string;
    env: IEnvVars;
    stages: IStage[];
}

export interface VersionedRunConfig {
    version: string;
    config: RunConfig;
}

export interface TestOrchestratorConfig {
    version: string;
}

export type RunStatus = "notStarted" | "running" | "done";
export type StageStatus = "notStarted" | "running" | "success" | "error";

export interface IRunStatus {
    title: string;
    description: string;
    status: string;
    stages: IStageStatus[];
}
export interface IStageStatus {
    id: number;
    title: string;
    description?: string;
    status: StageStatus;
    details: unknown;
}

export class TestOrchestrator {
    private readonly runId = uuid();
    private runStatus: RunStatus = "notStarted";
    private readonly doc: RunConfig;
    private readonly env = new Map<string, unknown>();
    private readonly stageStatus = new Map<number, IStageStatus>();
    constructor(private readonly c: TestOrchestratorConfig) {
        this.doc = TestOrchestrator.getConfig(this.c.version);
    }

    public static getConfigs(): VersionedRunConfig[] {
        return [
            { version: "v1", config: this.getConfig("v1") },
            { version: "v2", config: this.getConfig("v2") },
        ];
    }

    public static getConfig(version: string): RunConfig {
        return yaml.load(fs.readFileSync(this.getConfigFileName(version), "utf8")) as RunConfig;
    }

    public async run(): Promise<void> {
        this.runStatus = "running";
        const logger = await getLogger({
            runId: this.runId,
            scenarioName: this.doc?.title,
            namespace: "scenario:runner",
        });

        await PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "RunStages" },
            async () => {
                await this.execRun();
            },
            { start: true, end: true, cancel: "generic" },
        );
        this.runStatus = "done";
    }

    private async execRun(): Promise<void> {
        if (!this.doc) {
            throw new Error("Invalid config.");
        }

        for (const key of Object.keys(this.doc.env)) {
            this.env.set(`\${${key}}`, this.doc.env[key]);
        }

        for (const stage of this.doc.stages) {
            this.fillEnvForStage(stage.params);
            const runner = this.createRunner(stage);
            if (runner) {
                try {
                    console.log("Starting stage:", stage.name);
                    const r = await this.runStage(runner, stage);
                    if (r !== undefined && stage.out !== undefined) {
                        this.env.set(stage.out, r);
                    }
                    console.log("done with stage", stage.name);
                    this.stageStatus.set(stage.id, {
                        id: stage.id,
                        status: "success",
                        title: stage.name,
                        description: stage.description,
                        details: {},
                    });
                } catch (error) {
                    this.stageStatus.set(stage.id, {
                        id: stage.id,
                        status: "error",
                        title: stage.name,
                        description: error as string,
                        details: {},
                    });
                    console.log("Stage existed with error:", stage.name, error);
                    break;
                }
            }
        }
    }

    public getStatus(): IRunStatus {
        const r: IStageStatus[] = [];
        for (const [, value] of this.stageStatus) {
            r.push(value);
        }
        const stages = r.sort((a, b) => (a.id < b.id ? -1 : 1));

        return {
            title: this.doc?.title ?? "title",
            description: this.doc?.description ?? "description",
            status: this.runStatus,
            stages,
        };
    }

    private fillEnvForStage(params: IStageParams): void {
        for (const key of Object.keys(params)) {
            const val = params[key];
            if (typeof val === "string" && val[0] === "$") {
                params[key] = this.env.get(val);
            }
        }
    }

    private createRunner(stage: IStage): IRunner | undefined {
        switch (stage.package) {
            case "azure-client": {
                return new AzureClientRunner(stage.params as unknown as AzureClientRunnerConfig);
            }
            case "doc-creator": {
                return new DocCreatorRunner(stage.params as unknown as DocCreatorConfig);
            }
            case "shared-map-traffic": {
                return new MapTrafficRunner(stage.params as unknown as MapTrafficRunnerConfig);
            }
            default: {
                console.log("unknown stage:", stage);
            }
        }
    }

    private async runStage(runner: IRunner, stage: IStage): Promise<unknown> {
        // Initial status
        const initStatus = runner.getStatus();
        this.stageStatus.set(stage.id, {
            id: stage.id,
            title: stage.name,
            description: initStatus?.description ?? stage.description,
            status: initStatus.status,
            details: initStatus.details,
        });

        // Handle events
        runner.on("status", (e) => {
            this.stageStatus.set(stage.id, {
                id: stage.id,
                title: stage.name,
                description: e?.description ?? stage.description,
                status: e.status,
                details: JSON.stringify(e.details),
            });
            console.log("state change --------------->:");
            console.log(this.getStatus());
        });

        // exec
        return runner.run({
            runId: this.runId,
            scenarioName: this.doc?.title ?? "",
        });
    }

    private static getConfigFileName(version: string): string {
        switch (version) {
            case "v1": {
                return "./testConfig.yml";
            }
            case "v2": {
                return "./testConfigV2.yml";
            }
            default: {
                return "";
            }
        }
    }
}
