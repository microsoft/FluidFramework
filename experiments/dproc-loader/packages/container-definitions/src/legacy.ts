import { IRuntime } from "@prague/runtime-definitions";
import { IComponentRuntime } from "./chaincode";

export interface ILegacyRuntime extends IRuntime {
    createAndAttachProcess(id: string, pkg: string): Promise<IComponentRuntime>;
    getProcess(id: string, wait: boolean): Promise<IComponentRuntime>;
}
