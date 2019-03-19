import { 
  IContainerContext,
  IPlatform,
  IRequest,
  ISequencedDocumentMessage,
  IRuntime,
  ITree,
} from "@prague/container-definitions";
import { Runtime } from "@prague/runtime";
import { 
  IChaincode,
  IChaincodeComponent,
  IComponentDeltaHandler,
  IComponentRuntime,
  IRuntime as ILegacyRuntime
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { ComponentHost } from "./runtime/componentHost";

import { Provider, themes } from "@stardust-ui/react";
import { ChatContainer } from "./chat-container";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class ChatRunner extends EventEmitter implements IPlatform {
  private runtime: ILegacyRuntime;
  private priorOps: ISequencedDocumentMessage[] = [];

  public async run(runtime: ILegacyRuntime, platform: IPlatform) {
      this.runtime = runtime;
      this.runtime.on("op", (op: ISequencedDocumentMessage) => {
        this.priorOps.push(op);
      });
      return this;
  }

  public async queryInterface<T>(id: string): Promise<any> {
      return null;
  }

  public detach() {
      console.log("Chat detach");
      return;
  }

  public async attach(platform: IPlatform): Promise<IPlatform> {

      const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
      if (!hostContent) {
          // If headless exist early
          return;
      }


      let flag = false;

      const render = async () => {
        flag = true;
        console.log("Render");
        const runtime = this.runtime;
        const quorum = runtime.getQuorum();
        const user = quorum.getMember(this.runtime.clientId);
        const username = (user.client.user as any).name;
        runtime.removeAllListeners();
        const opHistory = this.priorOps;

        ReactDOM.render(
          <Provider theme={themes.teams}>
            <ChatContainer runtime={runtime} clientId={username} history={opHistory}/>
          </Provider>,
          hostContent
        );
      }

      this.runtime.on("connected", render);
      setTimeout(() => {
        if(flag === false) {
          render();
        }
      }, 1000)
  }
}



class Chaincode extends EventEmitter implements IChaincode {
  constructor(private runner: any) {
      super();
  }

  public getModule(type: string): any {
  }

  public close(): Promise<void> {
      return Promise.resolve();
  }

  public async run(runtime: ILegacyRuntime, platform: IPlatform): Promise<IPlatform> {
      return this.runner.run(runtime, platform);
  }

}


export class ChatComponent implements IChaincodeComponent {
  private chatRunner = new ChatRunner();
  private chaincode: Chaincode;
  private component: ComponentHost;

  constructor() {
      this.chaincode = new Chaincode(this.chatRunner);
  }

  public getModule(type: string) {
      return null;
  }

  public async close(): Promise<void> {
      return;
  }

  public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
      const chaincode = this.chaincode;

      const component = await ComponentHost.LoadFromSnapshot(runtime, chaincode);
      this.component = component;

      return component;
  }

  public async attach(platform: IPlatform): Promise<IPlatform> {
      return this.chatRunner.attach(platform);
  }

  public snapshot(): ITree {
      const entries = this.component.snapshotInternal();
      return { entries, sha: null };
  }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
  return new ChatComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  const registry = new Map<string, any>([
      ["@chaincode/chat-2", { instantiateComponent }],
  ]);

  const runtime = await Runtime.Load(registry, context);

  // Register path handler for inbound messages
  runtime.registerRequestHandler(async (request: IRequest) => {
      console.log(request.url);
      const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
          ? request.url.substr(1)
          : request.url;
      const trailingSlash = requestUrl.indexOf("/");

      const componentId = requestUrl
          ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
          : "chat-2";
      const component = await runtime.getComponent(componentId, true);

      // If there is a trailing slash forward to the component. Otherwise handle directly.
      if (trailingSlash === -1) {
          return { status: 200, mimeType: "prague/component", value: component };
      } else {
          return component.request({ url: requestUrl.substr(trailingSlash) });
      }
  });

  // On first boot create the base component
  if (!runtime.existing) {
      runtime.createAndAttachComponent("chat-2", "@chaincode/chat-2").catch((error) => {
          context.error(error);
      });
  }

  return runtime;
}