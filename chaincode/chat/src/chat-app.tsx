import { Document } from "@prague/app-component";
import { Counter, CounterValueType, IMap } from "@prague/map";
import { Provider, themes } from "@stardust-ui/react";
import { ChatContainer } from "./chat-container";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class ChatApp extends Document {
  // Initialize the document/component (only called when document is initially created).
  protected async create() {
    this.root.set<Counter>("msgCtr", 1, CounterValueType.Name);
    this.root.set("messages", this.createMap());
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async opened() {
    // If the host provided a <div>, display a minimal UI.
    const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {
      const msgCtr = await this.root.wait<Counter>("msgCtr");
      const messages = await this.root.wait<IMap>("messages");
      const messagesView = await messages.getView();
      await this.root.set("connected", true);

      setTimeout(() => {
        ReactDOM.render(
          <Provider theme={themes.teams}>
            <ChatContainer
              messages={messages}
              messageView={messagesView}
              counter={msgCtr}
              clientId={this.runtime.clientId}
            />
          </Provider>,
          maybeDiv
        );
      }, 3000);
    }
  }
}
