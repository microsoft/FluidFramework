/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {runtime} from "@augloop/runtime-client";
import { IClientMetadata } from "@augloop/schemas";
import { SliceManager } from "../augloop-worker";
import {configureRuntimeForWorkflows} from "./registration";
import {IAugResult, IDocTile} from "./schema";

const serviceUrl = "https://augloop-cluster-int-gw.southcentralus.cloudapp.azure.com";
const hostMetadata: IClientMetadata = {
    appName: "Prague",
    appPlatform: "Node",
};
export class AugLoopRuntime {
    private runtimeInitPromise: Promise<void> = null;
    private workflowPromise: Promise<void> = null;
    private callerMap: Map<string, SliceManager> = new Map<string, SliceManager>();

    public async initialize() {
        await this.startRuntime();
        await this.configureRuntimeForWorkflows();
    }

    public submit(fullId: string, input: IDocTile, schemaName: string, caller: SliceManager) {
        this.setCaller(fullId, caller);
        runtime.submit(schemaName, input);
    }

    public removeDocument(fullId) {
        if (this.callerMap.has(fullId)) {
            console.log(`Removing ${fullId} from runtime tracked documents`);
            this.callerMap.delete(fullId);
        }
    }

    private setCaller(fullId: string, caller: SliceManager) {
        if (!this.callerMap.has(fullId)) {
            this.callerMap.set(fullId, caller);
        }
    }
    private async startRuntime() {
        if (this.runtimeInitPromise !== null) {
          return this.runtimeInitPromise;
        }
        this.runtimeInitPromise = runtime.init(
            serviceUrl,
            hostMetadata,
            {
                isFeatureEnabled: null,
                onResult: this.onResultCallback.bind(this),
                requestAuthToken: null,
                sendTelemetryEvent: null,
            });
        return this.runtimeInitPromise;
    }

    private async configureRuntimeForWorkflows() {
        if (this.workflowPromise !== null) {
            return this.workflowPromise;
        }
        this.workflowPromise = configureRuntimeForWorkflows(runtime);
        return this.workflowPromise;
    }

    private onResultCallback(inputSchema: string, input: IDocTile, outputSchema: string, output: any) {
        const result: IAugResult = {
            input,
            output,
        };
        const fullId = input.documentId;
        if (this.callerMap.has(fullId)) {
            this.callerMap.get(fullId).onResult(result);
        }
    }
}
