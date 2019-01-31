import { Counter, IMap, IMapView } from "@prague/map";
import { Chat } from "@stardust-ui/react";
import { ChatRenderer } from "./chat-renderer";
import { filter } from "./filter";
import * as React from "react";
import { LoaderComponent } from "./component-loader";

interface IMessage {
  author: string;
  component?: string;
  content: string;
  time: string;
}

interface ChatProps {
  message: IMessage;
  key: string;
}

interface ChatContainerProps {
  messages: IMap;
  messageView: IMapView;
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
      let message = this.props.messageView.get(changed.key) as IMessage;
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

    for (const message of Object.values(this.state.messages)) {
      const isMine = message.message.author === this.props.clientId;
      const tss: string = new Date(Number.parseInt(message.message.time)).toLocaleString();
      messagesToRender.push({
        message: {
          content: (
            <Chat.Message 
              content={
                message.message.component ? 
                  <LoaderComponent
                    docId={message.message.component}
                    >
                  </LoaderComponent>
                : message.message.content
              }
              author={message.message.author}
              timestamp={tss}
              mine={isMine} />
          )
        },
        key: message.key
      });
    }

    return (
      <ChatRenderer
        messagesToRender={messagesToRender}
        inputMessage={inputMessage}
        onChangeHandler={this.inputChangeHandler}
        addMessageHandler={this.addMessageHandler}
      />
    );
  }

  /**
   * Fetch the existing messages
   */
  getInitialChat(): ChatProps[] {
    let items: ChatProps[] = [];

    this.props.messageView.forEach((value: IMessage, key: string) => {
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

  addMessageHandler = (component?: string) => {
    const { inputMessage } = this.state;
    const { counter, messageView, clientId } = this.props;

    if (!component && inputMessage.length === 0) return;

    this.setState({ inputMessage: "" });
    counter.increment(1);
    messageView.set<IMessage>(counter.value.toString(), {
      author: clientId,
      component: component,
      content: inputMessage,
      time: Date.now().toString()
    });

    return inputMessage;
  };
}
