import { IChaincodeComponent, IChaincodeHost } from "@prague/container-definitions";
import { ChartComponent } from "./chaincode";

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new ChartComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateHost(): Promise<IChaincodeHost> {
    return Promise.reject("Not yet implemented");
}
