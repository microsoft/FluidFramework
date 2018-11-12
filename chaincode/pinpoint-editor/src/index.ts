import { IChaincode } from "@prague/runtime-definitions";
import { Chaincode } from "./chaincode";
import { PinpointRunner } from "./runner";

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new PinpointRunner());
    return chaincode;
}
