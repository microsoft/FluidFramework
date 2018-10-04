import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import { EventEmitter } from "events";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { Chaincode } from "./chaincode";

class NotebookRunner extends EventEmitter implements IPlatform {
    private started = new Deferred<void>();
    private mapHost: HTMLElement;

    public async run(runtime: IRuntime, platform: IPlatform) {
        this.start(runtime, platform).then(
            () => {
                this.started.resolve();
            },
            (error) => {
                console.error(error);
                this.started.reject(error);
            });

        return this;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        // Wait for start to complete before resolving interfaces
        await this.started.promise;

        switch (id) {
            default:
                return null;
        }
    }

    private async start(runtime: IRuntime, platform: IPlatform): Promise<void> {
        // const collabDoc = await Document.Load(runtime);

        this.mapHost = await platform.queryInterface<HTMLElement>("div");
        if (!this.mapHost) {
            return;
        }

        monaco.editor.create(
            this.mapHost,
            {
                language: "typescript",
                value: 'console.log("Hello, world")',
            });
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new NotebookRunner());
    return chaincode;
}
