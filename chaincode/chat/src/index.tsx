import { Component } from "@prague/app-component";
import { ChatApp } from "./chat-app";
import { 
  IContainerContext, 
  IRuntime,
  ITree,
  IPlatform
} from "@prague/container-definitions";
import { ComponentHost } from "@prague/component";
import {
  IChaincode,
  IChaincodeComponent,
  IComponentDeltaHandler,
  IComponentRuntime } from "@prague/runtime-definitions";

// Example chainloader bootstrap.
export async function instantiateComponent(): Promise<IChaincodeComponent> {
  return Component.instantiateComponent(ChatApp);

}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {

  return Component.instantiateRuntime(context, "name", "@chaincode/chat", [
    ["@chaincode/chat", Promise.resolve({ instantiateComponent })]
  ]);
}

export class ChatAppComponent implements IChaincodeComponent {
  private chat: ChatApp;
  private chaincode: IChaincode;
  private component: ComponentHost;

  constructor() {
      this.chat = new ChatApp();
      this.chaincode = Component.instantiate(this.chat);
  }

  public getModule(type: string) {
      return null;
  }

  public async close(): Promise<void> {
      return;
  }

  public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
      const chaincode = this.chaincode;

      // All of the below would be hidden from a developer
      // Is this an await or does it just go?
      const component = await ComponentHost.LoadFromSnapshot(runtime, chaincode);
      this.component = component;

      return component;
  }

  public async attach(platform: IPlatform): Promise<IPlatform> {
      return this.chat.attach(platform);
  }

  public snapshot(): ITree {
      const entries = this.component.snapshotInternal();
      return { entries };
  }
}
