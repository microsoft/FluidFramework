import {
    IChaincodeComponent,
    IComponentRuntime,
    IDeltaHandler,
} from "@prague/process-definitions";
import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { ComponentHost } from "./componentHost";
import { debug } from "./debug";

export class LegacyChaincodeBridge implements IChaincodeComponent {
    constructor(private chaincode: IChaincode) {
    }

    public getModule(type: string) {
        debug(`getModule ${type}`);
        return null;
    }

    public async close(): Promise<void> {
        debug("close");
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IDeltaHandler> {
        debug("WE RUNNIN YO!!! :)");

        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime,
            runtime.tenantId,
            runtime.documentId,
            runtime.id,
            runtime.platform,
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

        return component;
    }
}
