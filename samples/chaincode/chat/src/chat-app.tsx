import { Document } from "@prague/app-component";
import { Counter, CounterValueType, ISharedMap, registerDefaultValueType } from "@prague/map";
import { Provider, themes } from "@stardust-ui/react";
import { ChatContainer } from "./chat-container";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class ChatApp extends Document {

  constructor() {
    super();
    registerDefaultValueType(new CounterValueType());
  }

  // Initialize the document/component (only called when document is initially created).
  protected async create() {
    this.root.set("msgCtr", 1, CounterValueType.Name);
    this.root.set("messages", this.createMap());
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async opened() {

    // If the host provided a <div>, display a minimal UI.
    const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {
      const msgCtrP = this.root.wait<Counter>("msgCtr");
      const messagesP = this.root.wait<ISharedMap>("messages");

      let flag = false;

      const render = async () => {
        flag = true;
        console.log("Render");
        const quorum = this.runtime.getQuorum();
        const user = quorum.getMember(this.runtime.clientId);
        const username = (user.client.user as any).name;

        const msgCtr = await msgCtrP;
        const messages = await messagesP;
        ReactDOM.render(
          <Provider theme={themes.teams}>
            <ChatContainer messages={messages} counter={msgCtr} clientId={username} />
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
