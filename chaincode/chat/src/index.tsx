import { IChaincode } from "@prague/runtime-definitions";
import { Document, DataStore } from "@prague/datastore";
import { Counter, CounterValueType, IMap, IMapView} from "@prague/map";
import { Chat, Divider, Input, Provider, themes } from "@stardust-ui/react";
import * as React from "react";
import * as  ReactDOM from "react-dom";

interface IMessage {
    author: string,
    content: string,
    time: string,
}

interface ChatWrapperProps {
    messages: IMap
    messageView: IMapView;
    counter: Counter;
    clientId: string;
}

interface ChatProps {
    message: IMessage;
    key: string;
}

class ChatWrapper extends React.Component<ChatWrapperProps, ChatProps[]> {
    constructor(props) {
        super(props);
    }

    componentDidMount(){
        this.setState(this.getItems());

        this.props.messages.on("valueChanged", (changed) => {
            let message = this.props.messageView.get(changed.key) as IMessage;
            const chatProp = {
                message,
                key: changed.key,
            } as ChatProps;

            let messages = this.state;
            messages = Object.values(messages);
            messages = messages.concat([chatProp]);
            this.setState(messages)
        })
    }

    render() {
        if (this.state === null) {
            return <div> No State Yet </div>
        }
        const start: any[] = [{
            message: <Divider content="Today" color="primary" important />,
            key: '0',
          }];

        let messages = this.state;
        messages = Object.values(messages);

        for (const message of messages) {
            if (message.message.author === this.props.clientId) {
                start.push({
                    message: {
                        content: (
                        <Chat.Message content={message.message.content} author={message.message.author} timestamp={message.message.time} mine />
                        ),
                    },
                    key: message.key
                });
            } else {
                start.push({
                    message: {
                        content: (
                        <Chat.Message content={message.message.content} author={message.message.author} timestamp={message.message.time} />
                        ),
                    },
                    key: message.key
                });
            }
        }

        // Start and items both work, which is annoying.
        return(
            <div>
                <Chat items={messages} />
                <Divider color="primary" size={2} important />
                <Input id="messageSendField" fluid
                        icon="send"
                        placeholder="Message..."
                        onKeyPress={(key) => {
                            if (key.charCode === 13) {
                                this.addMessage();
                            }
                        }}
                />
            </div>
            );
    }


    getItems(): ChatProps[]  {
        let items: ChatProps[];
        items = [];

        this.props.messageView.forEach((value: IMessage, key: string) => {
            
            let chatProp: ChatProps = {
                message: value,
                key,
            };
            items.push(chatProp);
        });

        return items;
    }

    addMessage() {
        const input = document.getElementById("messageSendField") as HTMLInputElement;
        const messageVal = input.value;
        input.value = "";
        this.props.counter.increment(1);
        this.props.messageView.set<IMessage>(this.props.counter.value.toString(), {
            author: this.props.clientId,
            content: messageVal,
            time: Date.now().toString(),
        });
        return messageVal;
    }
}

export class ChatApp extends Document {

    // Initialize the document/component (only called when document is initially created).
    protected async create() {
        this.root.set<Counter>("msgCtr", 1, CounterValueType.Name);
        this.root.set("messages", this.createMap());
        let messages = await this.root.get("messages");

        const start = {
            message: <Divider content="Today" color="primary" important />,
            key: '0',
          };
        messages.set("0", start);
    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened() {
        // If the host provided a <div>, display a minimual UI.
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");        
        if (maybeDiv) {
            const msgCtr = await this.root.wait<Counter>("msgCtr");
            const messages = await this.root.wait<IMap>("messages");
            const messagesView = await messages.getView();
            await this.root.set("connected", true);

            setTimeout(() => {
                ReactDOM.render(
                    <Provider theme={themes.teams}>
                        <ChatWrapper messages={messages} messageView={messagesView} counter={msgCtr} clientId={this.runtime.clientId} />
                    </Provider>,
                    maybeDiv
                );
            }, 3000);
        }
    }
}


// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return DataStore.instantiate(new ChatApp());
}
