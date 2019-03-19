import { ISequencedDocumentMessage, MessageType } from "@prague/container-definitions";
import { IRuntime } from "@prague/runtime-definitions";
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
}

interface ChatContainerProps {
  runtime: IRuntime;
  clientId: string;
  history: ISequencedDocumentMessage[];
}

interface ChatContainerState {
  messages: ChatProps[];
  inputMessage: string;
}

export class ChatContainer extends React.Component<ChatContainerProps, ChatContainerState> {
  componentDidMount() {
    this.setState({ messages: this.getInitialChat(this.props.history), inputMessage: "" });

    this.props.runtime.on("op", (op: ISequencedDocumentMessage) => {
      let message: IMessage = op.contents;
      message.content = filter(message.content);
      const chatProp = { message } as ChatProps;

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

  getInitialChat(ops: ISequencedDocumentMessage[]): ChatProps[] {
    let items: ChatProps[] = [];
    for (const op of ops) {
      let message: IMessage = op.contents;
      message.content = filter(message.content);
      const chatProp = { message } as ChatProps;
      items.push(chatProp);
    }
    return items;
  }

  inputChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) => this.setState({ inputMessage: event.target.value });

  appendMessageCb = async (component?: IOutieProps) => {
    const { inputMessage } = this.state;
    const { runtime, clientId } = this.props;

    if (inputMessage.length === 0 && !component) return;

    this.setState({ inputMessage: "" });
    runtime.submitMessage(MessageType.Operation, {
      author: clientId,
      component,
      content: inputMessage,
      time: Date.now().toString(),
    });

    // TODO this hack stops appendMessage from getting into a loop without setting state.
    setTimeout(() => {
      const maybeComponent = findComponent(inputMessage);
      if (maybeComponent) {
        this.appendMessageCb(maybeComponent);
      }
    }, 100);

    return inputMessage;
  };
}
