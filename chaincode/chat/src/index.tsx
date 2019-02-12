import { Component } from "@prague/app-component";
import { ChatApp } from "./chat-app";
import { 
  IContainerContext, 
  IPlatform,
  IRequest,
  IRuntime,
  ITree
} from "@prague/container-definitions";
import {
  ComponentHost,
  Runtime,
} from "@prague/runtime";
import {
  IChaincode,
  IChaincodeComponent,
  IComponentDeltaHandler,
  IComponentPlatform,
  IComponentRuntime } from "@prague/runtime-definitions";

// Example chainloader bootstrap.
export async function instantiateComponent(): Promise<IChaincodeComponent> {
  return new ChatAppComponent(); // Component.instantiate(new ChatApp());
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  const registry = new Map<string, any>([
    ["@chaincode/chat", { instantiateComponent }]
  ]);

  const runtime = await Runtime.Load(
    registry,
    context.tenantId,
    context.id,
    context.parentBranch,
    context.existing,
    context.options,
    context.clientId,
    { id: "test" },
    context.blobManager,
    context.deltaManager,
    context.quorum,
    context.storage,
    context.connectionState,
    context.baseSnapshot,
    context.blobs,
    context.branch,
    context.minimumSequenceNumber,
    context.submitFn,
    context.snapshotFn,
    context.closeFn);

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
      console.log(request.url);
      const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
          ? request.url.substr(1)
          : request.url;
      const trailingSlash = requestUrl.indexOf("/");

      const componentId = requestUrl
          ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
          : "text";
      const component = await runtime.getProcess(componentId, true);

      // If there is a trailing slash forward to the component. Otherwise handle directly.
      if (trailingSlash === -1) {
          return { status: 200, mimeType: "prague/component", value: component };
      } else {
          return component.request({ url: requestUrl.substr(trailingSlash) });
      }
  });

  // On first boot create the base component
  if (!runtime.existing) {
      runtime.createAndAttachProcess("text", "@chaincode/chat").catch((error) => {
          context.error(error);
      });
  }

  return runtime;
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

  public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IComponentDeltaHandler> {
      const chaincode = this.chaincode;

      // All of the below would be hidden from a developer
      // Is this an await or does it just go?
      const component = await ComponentHost.LoadFromSnapshot(
          runtime,
          runtime.tenantId,
          runtime.documentId,
          runtime.id,
          runtime.parentBranch,
          runtime.existing,
          runtime.options,
          runtime.clientId,
          runtime.user,
          runtime.blobManager,
          runtime.baseSnapshot,
          chaincode,
          runtime.deltaManager,
          runtime.getQuorum(),
          runtime.storage,
          runtime.connectionState,
          runtime.branch,
          runtime.minimumSequenceNumber,
          runtime.snapshotFn,
          runtime.closeFn);
      this.component = component;

      return component;
  }

  public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
      return this.chat.attach(platform);
  }

  public snapshot(): ITree {
      const entries = this.component.snapshotInternal();
      return { entries };
  }
}
