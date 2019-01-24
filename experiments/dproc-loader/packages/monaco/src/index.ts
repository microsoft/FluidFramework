import { IChaincodeComponent, IChaincodeHost } from "@prague/process-definitions";
import { MonacoComponent } from "./chaincode";

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new MonacoComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateHost(): Promise<IChaincodeHost> {
    return Promise.reject("Not yet implemented");
}
