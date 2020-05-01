/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { Chat as ChatUI, Provider, themes } from "@fluentui/react-northstar";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import { ChatRenderer } from "./components";

export const ChatName = "chat";

export const MessagesKey = "messages";

export interface IMessage {
    author: string;
    content: string;
    time: string;
    translated: boolean;
}

/**
 * A component to allow you to chat with others
 */
export class Chat extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly factory = new PrimedComponentFactory(ChatName, Chat, [], {});

    public static getFactory() {
        return Chat.factory;
    }

    async componentInitializingFirstTime() {
        this.root.set<IMessage[]>(MessagesKey, []);
    }

    async componentHasInitialized() {
        this.root.get("messages");
    }

    public render(e: HTMLElement) {
        const user = this.runtime.clientId ? this.runtime.getQuorum().getMember(this.runtime.clientId) : undefined;
        const userName = (user?.client.user as any).name;
        ReactDOM.render(
            <Provider theme={themes.teams}>
                <ChatView runtime={this.runtime} root={this.root} clientId={userName} />
            </Provider>,
            e,
        );
    }
}

interface IChatViewProps {
    runtime: IComponentRuntime;
    root: ISharedDirectory;
    clientId: string;
}

interface IChatViewState {
    messages: IMessage[];
    inputMessage: string;
}

class ChatView extends React.Component<IChatViewProps, IChatViewState> {
    constructor(props: IChatViewProps) {
        super(props);
        const { root } = this.props;
        this.state = { messages: root.get<IMessage[]>(MessagesKey), inputMessage: "" };

        root.on("valueChanged", (changed: IDirectoryValueChanged, local: boolean) => {
            const rootMessages = root.get<IMessage[]>(MessagesKey);
            if (rootMessages !== this.state.messages) {
                this.setState({
                    messages: root.get<IMessage[]>(MessagesKey),
                });
            }
        });
    }

    render() {
        const { inputMessage, messages } = this.state;
        const messagesToRender: any[] = [];

        // Build up message history
        for (const message of messages) {
            const isMine = message.author === this.props.clientId;
            const tss: string = new Date(Number.parseInt(message.time, 10)).toLocaleString();
            messagesToRender.push({
                message: {
                    content: (
                        <ChatUI.Message
                            content={message.content}
                            author={message.author}
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

    public inputChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) =>
        this.setState({ inputMessage: event.target.value });

    public appendMessage = () => {
        const { inputMessage } = this.state;
        const { root, clientId } = this.props;

        if (inputMessage.length === 0) {
            return;
        }

        this.setState({ inputMessage: "" });
        const newMessage = {
            author: clientId,
            content: inputMessage,
            time: Date.now().toString(),
            translated: false,
        };
        const newMessages = this.state.messages;
        newMessages.push(newMessage);
        root.set(MessagesKey, newMessages);
    };
}

export const fluidExport = Chat.getFactory();
