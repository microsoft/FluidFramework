import { 
  IContainerContext,
  IPlatform,
  IRequest,
  ISequencedDocumentMessage,
  IRuntime,
} from "@prague/container-definitions";
import { EventEmitter } from "events";
import { Runtime } from "./runtime/runtime";

import { Provider, themes } from "@stardust-ui/react";
import { ChatContainer } from "./chat-container";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class ChatRunner extends EventEmitter implements IPlatform {
  private runtime: Runtime;
  private priorOps: ISequencedDocumentMessage[] = [];

  public async run(runtime: Runtime) {
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

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  const runtime = await Runtime.Load(context);
  const chatRunner = new ChatRunner();

  // Register path handler for inbound messages
  runtime.registerRequestHandler(async (request: IRequest) => {
      console.log(request.url);
      const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
          ? request.url.substr(1)
          : request.url;
      const trailingSlash = requestUrl.indexOf("/");

      // If there is a trailing slash forward to the component. Otherwise handle directly.
      if (trailingSlash === -1) {
          return { status: 200, mimeType: "prague/component", value: chatRunner };
      }
  });

  chatRunner.run(runtime);

  return runtime;
}