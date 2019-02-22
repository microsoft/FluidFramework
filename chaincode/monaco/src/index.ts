import { IChaincodeComponent } from "@prague/runtime-definitions";
import { MonacoComponent } from "./chaincode";

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new MonacoComponent();
}
