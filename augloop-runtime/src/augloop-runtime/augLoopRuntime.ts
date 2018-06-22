import {HostMetadata, runtime} from "@augloop/runtime-client";
import { EventEmitter } from "events";
import {configureRuntimeForWorkflows} from "./registration";
import {IAugResult, IDocTile} from "./schema";

const serviceUrl = "https://augloop-cluster-int-gw.southcentralus.cloudapp.azure.com";
const hostMetadata: HostMetadata = {
    appName: "Prague",
    appPlatform: "Node",
};
export class AugLoopRuntime extends EventEmitter {
    private runtimeInitPromise: Promise<void> = null;
    private workflowPromise: Promise<void> = null;

    constructor() {
        super();
    }

    public submit(input: IDocTile, schemaName: string) {
        this.startRuntime().then(() => {
            this.configureRuntimeForWorkflows().then(() => {
                runtime.submit(schemaName, input);
            }, (err) => {
                this.emit("error", err);
            });
        }, (error) => {
            this.emit("error", error);
        });
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
        this.emit("result", result);
    }
}
