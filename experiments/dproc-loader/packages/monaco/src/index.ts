import { IChaincodeComponent } from "@prague/container-definitions";
import { MonacoComponent } from "./chaincode";

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new MonacoComponent();
}
