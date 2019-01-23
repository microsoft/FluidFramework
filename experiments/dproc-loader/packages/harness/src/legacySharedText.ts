import * as text from "@chaincode/shared-text";
import { IChaincodeComponent } from "@prague/process-definitions";
import { LegacyChaincodeBridge } from "./legacyBridge";

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    console.log("HELOOOOOOOO");
    const code = await text.instantiate();
    return new LegacyChaincodeBridge(code);
}
