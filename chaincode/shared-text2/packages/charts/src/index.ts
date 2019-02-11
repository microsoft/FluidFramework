import { IChaincodeComponent } from "@prague/runtime-definitions";
import { ChartComponent } from "./chaincode";

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new ChartComponent();
}
