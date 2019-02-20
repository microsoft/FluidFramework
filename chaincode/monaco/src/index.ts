import { Component } from "@prague/app-component";
import { IChaincodeComponent } from "@prague/runtime-definitions";
import { Monaco } from "./chaincode";

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return Component.instantiateComponent(Monaco);
}
