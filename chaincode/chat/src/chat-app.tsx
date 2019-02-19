import { Component } from "@prague/app-component";
import { Counter, CounterValueType, ISharedMap, registerDefaultValueType, MapExtension } from "@prague/map";
import { Provider, themes } from "@stardust-ui/react";
import { ChatContainer } from "./chat-container";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Deferred } from "@prague/utils";
import * as uuid from "uuid/v4";
import { IPlatform } from "@prague/container-definitions";

export class ChatApp extends Component {
  private ready = new Deferred<void>();

  constructor() {
    super([[MapExtension.Type, new MapExtension()]]);
    registerDefaultValueType(new CounterValueType());
  }

  // Initialize the document/component (only called when document is initially created).
  protected async create() {
    this.root.set<Counter>("msgCtr", 1, CounterValueType.Name);
    this.root.set("messages", this.createMap());
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async opened() {
    this.ready.resolve();
  }

  public async attach(platform: IPlatform): Promise<void> {
    await this.ready.promise;

    // If the host provided a <div>, display a minimal UI.
    const maybeDiv = await platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {
      const msgCtr = await this.root.wait<Counter>("msgCtr");
      const messages = await this.root.wait<ISharedMap>("messages");

      const render = () => {
        const quorum = this.runtime.getQuorum();
        const user = quorum.getMember(this.runtime.clientId);
        const username = (user.client.user as any).name;
        ReactDOM.render(
          <Provider theme={themes.teams}>
            <ChatContainer messages={messages} counter={msgCtr} clientId={username} />
          </Provider>,
          maybeDiv
        );
      }

      this.runtime.on("connected", render);
    }
  }

  createMap(id: string = uuid()): ISharedMap {
    return this.runtime.createChannel(id, MapExtension.Type) as ISharedMap;
  }
}
