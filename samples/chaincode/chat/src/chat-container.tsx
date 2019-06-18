/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Counter, ISharedMap } from "@prague/map";
import { Chat } from "@stardust-ui/react";
import { ChatRenderer } from "./chat-renderer";
import { filter } from "./filter";
import * as React from "react";
import { LoaderComponent, IOutieProps } from "./component-loader";
import { findComponent } from "./urlDecoder";

interface IMessage {
  author: string;
  component?: IOutieProps;
  content: string;
  time: string;
}

interface ChatProps {
  message: IMessage;
  key: string;
}

interface ChatContainerProps {
  messages: ISharedMap;
  counter: Counter;
  clientId: string;
}

interface ChatContainerState {
  messages: ChatProps[];
  inputMessage: string;
}

export class ChatContainer extends React.Component<ChatContainerProps, ChatContainerState> {
  componentDidMount() {
    this.setState({ messages: this.getInitialChat(), inputMessage: "" });

    this.props.messages.on("valueChanged", changed => {
      let message = this.props.messages.get(changed.key);
      message.content = filter(message.content);
      const chatProp = {
        message,
        key: changed.key
      } as ChatProps;

      const messages = Object.values(this.state.messages).concat([chatProp]);
      this.setState({ messages });

    });
  }

  render() {
    if (this.state === null) {
      return <div> Fetching Messages </div>;
    }

    const { inputMessage } = this.state;
    const messagesToRender: any[] = [];


    // Build up message history
    for (const chatProp of Object.values(this.state.messages)) {
      const isMine = chatProp.message.author === this.props.clientId;
      const tss: string = new Date(Number.parseInt(chatProp.message.time)).toLocaleString();
      messagesToRender.push({
        message: {
          content: (
            <Chat.Message 
              content={
                chatProp.message.component ? 
                  <LoaderComponent
                      {...chatProp.message.component}
                    >
                  </LoaderComponent>
                : chatProp.message.content
              }
              author={chatProp.message.author}
              timestamp={tss}
              mine={isMine} />
          )
        },
        key: chatProp.key
      });
    }

    return (
      <ChatRenderer
        messagesToRender={messagesToRender}
        inputMessage={inputMessage}
        onChangeHandler={this.inputChangeHandler}
        appendMessageCb={this.appendMessageCb}
      />
    );
  }

  /**
   * Fetch the existing messages
   */
  getInitialChat(): ChatProps[] {
    let items: ChatProps[] = [];
    this.props.messages.forEach((value: IMessage, key: string) => {
      value.content = filter(value.content);
      let chatProp: ChatProps = {
        message: value,
        key
      };
      items.push(chatProp);
    });

    return items;
  }

  inputChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) => this.setState({ inputMessage: event.target.value });

  appendMessageCb = async (component?: IOutieProps) => {
    const { inputMessage } = this.state;
    const { counter, clientId, messages } = this.props;

    if (inputMessage.length === 0 && !component) return;

    this.setState({ inputMessage: "" });
    counter.increment(1);
    messages.set<IMessage>(counter.value.toString(), {
      author: clientId,
      component: component,
      content: inputMessage,
      time: Date.now().toString()
    });

    // TODO this hack stops appendMessage from getting into a loop without setting state.
    setTimeout(() => {
      const maybeComponent = findComponent(inputMessage);
      console.log(maybeComponent);
      if (maybeComponent) {
        this.appendMessageCb(maybeComponent);
      }
    }, 100);

    return inputMessage;
  };
}
