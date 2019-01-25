import * as counter from "@chaincode/counter";
import { IChaincodeComponent } from "@prague/process-definitions";
import { LegacyChaincodeBridge } from "@prague/process-utils";

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    const code = await counter.instantiate();
    return new LegacyChaincodeBridge(code);
}
