import { ISequencedDocumentMessage, MessageType } from "@prague/container-definitions";
import { Chat } from "@stardust-ui/react";
import * as React from "react";
import { Runtime } from "../runtime/runtime";
import { ChatRenderer } from "./chat-renderer";
import { filter } from "./filter";

interface IMessage {
  author: string;
  content: string;
  time: string;
}

interface IChatProps {
  message: IMessage;
}

interface IChatContainerProps {
  runtime: Runtime;
  clientId: string;
  history: ISequencedDocumentMessage[];
}

interface IChatContainerState {
  messages: IChatProps[];
  inputMessage: string;
}

export class ChatContainer extends React.Component<IChatContainerProps, IChatContainerState> {
  public componentDidMount() {
    this.setState({ messages: this.getInitialChat(this.props.history), inputMessage: "" });

    this.props.runtime.on("op", (op: ISequencedDocumentMessage) => {
      const message: IMessage = op.contents;
      message.content = filter(message.content);
      const chatProp = { message } as IChatProps;

      const messages = Object.values(this.state.messages).concat([chatProp]);
      this.setState({ messages });

    });
  }

  public render() {
    if (this.state === null) {
      return <div> Fetching Messages </div>;
    }

    const { inputMessage } = this.state;
    const messagesToRender: any[] = [];

    // Build up message history
    for (const chatProp of Object.values(this.state.messages)) {
      const isMine = chatProp.message.author === this.props.clientId;
      const tss: string = new Date(Number.parseInt(chatProp.message.time, 10)).toLocaleString();
      messagesToRender.push({
        message: {
          content: (
            <Chat.Message
              content = { chatProp.message.content }
              author = { chatProp.message.author }
              timestamp={tss}
              mine={isMine} />
          ),
        },
      });
    }

    return (
      <ChatRenderer
        messagesToRender={messagesToRender}
        inputMessage={inputMessage}
        onChangeHandler={this.inputChangeHandler}
        appendMessageCb={this.appendMessage}
      />
    );
  }

  public getInitialChat(ops: ISequencedDocumentMessage[]): IChatProps[] {
    const items: IChatProps[] = [];
    for (const op of ops) {
      const message: IMessage = op.contents;
      message.content = filter(message.content);
      const chatProp = { message } as IChatProps;
      items.push(chatProp);
    }
    return items;
  }

  public inputChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ inputMessage: event.target.value })

  public appendMessage = () => {
    const { inputMessage } = this.state;
    const { runtime, clientId } = this.props;

    if (inputMessage.length === 0) {
      return;
    }

    this.setState({ inputMessage: "" });

    runtime.submitMessage(MessageType.Operation, {
      author: clientId,
      content: inputMessage,
      time: Date.now().toString(),
    });
  }
}
