/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as yaml from "js-yaml";

import {
    AzureClientFactory,
    AzureClientFactoryConfig,
} from "./azureClientRunner";
import {
    DocCreatorConfig,
    DocCreatorRunner,
} from "./docCreatorRunner";
import {
    MapTrafficRunnerConfig,
    MapTrafficRunner,
} from "./mapTrafficRunner";
import { IRunner } from "./interface";

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

export type RunStatus = "notstarted" | "running" | "done";
export type StageStatus = "notstarted" | "running" | "success" | "error";

export interface IRunStatus{
    title: string;
    description: string;
    status: string;
    stages: IStageStatus[];
}
export interface IStageStatus{
    id: number;
    title: string;
    description?: string;
    status: StageStatus;
    details: unknown;
}

export class TestOrchestrator {
    private runStatus: RunStatus = "notstarted";
    private doc: RunConfig | undefined;
    private readonly env = new Map<string, unknown>();
    private readonly stageStatus = new Map<number, IStageStatus>();
    private readonly c: TestOrchestratorConfig;

    constructor(config: TestOrchestratorConfig) {
        this.c = config;
    }

    public static getConfigs(): VersionedRunConfig[] {
        return [
            { version: "v1", config: this.getConfig("v1") },
        ];
    }

    public static getConfig(version: string): RunConfig {
        return yaml.load(fs.readFileSync(this.getConfigFileName(version), "utf8")) as RunConfig;
    }

    public async run(): Promise<void> {
        this.runStatus = "running";
        console.log("running config version:", this.c.version)
        this.doc = TestOrchestrator.getConfig(this.c.version)

        for(const key of Object.keys(this.doc.env)) {
            this.env.set(`\${${key}}`, this.doc.env[key]);
        }

        for (const stage of this.doc.stages) {
            this.fillEnvForStage(stage.params);
            const runner = this.createRunner(stage);
            if (runner) {
                try {
                    const r = await this.runStage(runner, stage);
                    if (r !== undefined && stage.out !== undefined) {
                        this.env.set(stage.out, r);
                    }
                    console.log("done with stage", stage.name);
                } catch(error) {
                    console.log("stage existed with error:", stage.name, error);
                    break;
                }
            }
        }
        this.runStatus = "done";
    }

    public getStatus(): IRunStatus {
        const r: IStageStatus[] = [];
        for(const [, value] of this.stageStatus) {
            r.push(value)
        }
        const stages = r.sort((a, b) => a.id < b.id ? -1 : 1);

        return {
            title: this.doc?.title ?? "title",
            description: this.doc?.description ?? "description",
            status: this.runStatus,
            stages,
        }
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
            case "azureFactory": {
                return new AzureClientFactory(stage.params as unknown as AzureClientFactoryConfig);
            }
            case "emptyDocCreator": {
                return new DocCreatorRunner(stage.params as unknown as DocCreatorConfig);
            }
            case "sharedMapTrafficGen": {
                return new MapTrafficRunner(stage.params as unknown as MapTrafficRunnerConfig);
            }
            default: {
                console.log("unknown stage:", stage);
            }
        }
    }

    private async runStage(runner: IRunner, stage: IStage): Promise<unknown> {
        // Initial status
        const initStatus = runner.getStatus()
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
            })
            console.log("state change --------------->:");
            console.log(this.getStatus())
        });
        runner.on("done", () => {
            console.log("stage done");
        });

        // exec
        return runner.run();
    }

    private static getConfigFileName(version: string): string {
        switch (version) {
            case "v1": {
                return "./testConfig.yml"
            }
            default: {
                return ""
            }
        }
    }
}

const o = new TestOrchestrator({version: "v1"})
o.run()
    .then(() => {
        console.log("TestOrchestrator: done");
    })
    .catch((error) => {
        console.log("TestOrchestrator: error:", error);
    });
