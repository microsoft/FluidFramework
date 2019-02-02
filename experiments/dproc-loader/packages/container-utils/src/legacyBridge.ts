import {
    IChaincodeComponent,
    IComponentPlatform,
    IComponentRuntime,
    IDeltaHandler,
} from "@prague/container-definitions";
import { IChaincode, IPlatform, ITree } from "@prague/runtime-definitions";
import { ComponentHost } from "./componentHost";

export class LegacyChaincodeBridge implements IChaincodeComponent {
    private component: ComponentHost;

    constructor(private chaincode: IChaincode) {
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IDeltaHandler> {
        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime,
            runtime.tenantId,
            runtime.documentId,
            runtime.id,
            runtime.parentBranch,
            runtime.existing,
            runtime.options,
            runtime.clientId,
            runtime.user,
            runtime.blobManager,
            runtime.baseSnapshot,
            chaincode,
            runtime.deltaManager,
            runtime.getQuorum(),
            runtime.storage,
            runtime.connectionState,
            runtime.branch,
            runtime.minimumSequenceNumber,
            runtime.snapshotFn,
            runtime.closeFn);
        this.component = component;

        return component;
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        return null;
    }

    // TODO the attach and the snapshot may want to be exposed on the return value from the run call
    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries };
    }
}
