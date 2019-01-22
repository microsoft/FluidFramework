import * as pinpoint from "@prague/pinpoint-editor";
import { IChaincodeComponent } from "@prague/process-definitions";
import { LegacyChaincodeBridge } from "./legacyBridge";

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    const code = await pinpoint.instantiate();
    return new LegacyChaincodeBridge(code);
}
