import { Document } from "@prague/app-component";
import { Provider, themes } from "@stardust-ui/react";
import { ChatContainer } from "./chat-container";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class ChatApp extends Document {

  constructor() {
    super();
  }

  public async create(){
    // No need to create anything
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async opened() {

    // If the host provided a <div>, display a minimal UI.
    const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {

      let flag = false;

      const render = async () => {
        flag = true;
        console.log("Render");
        const runtime = this.runtime;
        const quorum = runtime.getQuorum();
        const user = quorum.getMember(this.runtime.clientId);
        const username = (user.client.user as any).name;

        ReactDOM.render(
          <Provider theme={themes.teams}>
            <ChatContainer runtime={runtime} clientId={username} />
          </Provider>,
          maybeDiv
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
}
