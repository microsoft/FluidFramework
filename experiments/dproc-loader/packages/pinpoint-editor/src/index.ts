import { IChaincodeComponent, IChaincodeHost } from "@prague/container-definitions";
import { PinpointComponent } from "./chaincode";

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new PinpointComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateHost(): Promise<IChaincodeHost> {
    return Promise.reject("Not yet implemented");
}
