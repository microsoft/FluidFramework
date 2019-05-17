import { Component } from "@prague/app-component";
import { ChatApp } from "./chat-app";
import { 
  IContainerContext, 
  IRuntime,
} from "@prague/container-definitions";

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/chat", new Map([
    ["@chaincode/chat", Promise.resolve(Component.createComponentFactory(ChatApp))]
  ]));
}
