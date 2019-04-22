/// <reference types="node" />
import { IPlatform, ITree } from "@prague/container-definitions";
import { IChaincodeComponent, IComponentDeltaHandler, IComponentRuntime, IRuntime as ILegacyRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
export declare class MonacoRunner extends EventEmitter implements IPlatform {
    private mapHost;
    private codeModel;
    private codeEditor;
    private rootView;
    private collabDocDeferred;
    run(runtime: ILegacyRuntime, platform: IPlatform): Promise<this>;
    queryInterface<T>(id: string): Promise<any>;
    detach(): void;
    attach(platform: IPlatform): Promise<IPlatform>;
    private initialize;
    private mergeDelta;
    private mergeDeltaGroup;
    private mergeInsertDelta;
    private mergeRemoveDelta;
    private offsetsToRange;
    private runCode;
    private exec;
}
export declare class MonacoComponent implements IChaincodeComponent {
    private sharedText;
    private chaincode;
    private component;
    constructor();
    getModule(type: string): any;
    close(): Promise<void>;
    run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler>;
    attach(platform: IPlatform): Promise<IPlatform>;
    snapshot(): ITree;
}
//# sourceMappingURL=chaincode.d.ts.map