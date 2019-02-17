import { Component } from "@prague/app-component";
import { ChatApp } from "./chat-app";
import { 
  IContainerContext, 
  IRuntime,
} from "@prague/container-definitions";
import {
  IChaincodeComponent } from "@prague/runtime-definitions";

// Example chainloader bootstrap.
export async function instantiateComponent(): Promise<IChaincodeComponent> {
  return Component.instantiateComponent(ChatApp);

}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {

  return Component.instantiateRuntime(context, "name", "@chaincode/chat", [
    ["@chaincode/chat", Promise.resolve({ instantiateComponent })]
  ]);
}
