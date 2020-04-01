/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import { Chat } from "@stardust-ui/react";
import * as React from "react";
import { ChatRenderer } from "./chatRenderer";
import { IMessage, MessagesKey } from "..";

interface IChatContainerProps {
    runtime: IComponentRuntime;
    root: ISharedDirectory;
    clientId: string;
}

interface IChatContainerState {
    messages: IMessage[];
    inputMessage: string;
}

export class ChatContainer extends React.Component<IChatContainerProps, IChatContainerState> {
    constructor(props: IChatContainerProps) {
        super(props);
        const {root} = props;

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

    public render() {
        const { inputMessage, messages } = this.state;
        const messagesToRender: any[] = [];

        // Build up message history
        for (const message of messages) {
            const isMine = message.author === this.props.clientId;
            const tss: string = new Date(Number.parseInt(message.time, 10)).toLocaleString();
            messagesToRender.push({
                message: {
                    content: (
                        <Chat.Message
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

    public getInitialChat(oldMessages: IMessage[]): IMessage[] {

        return oldMessages;
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

    // private convertMessage(message: IMessage): IMessage | undefined {
    //     if (message.content.startsWith(transPrefix)) {
    //         const lang = message.content.substr(transPrefix.length);
    //         if (message.author === this.props.clientId) {
    //             this.selfLanguage = lang;
    //         }
    //         this.toLanguages.add(lang);
    //         return message;
    //     } else if (message.author === this.props.clientId) {
    //         if (!message.translated) {
    //             return message;
    //         }
    //     } else if (message.language === this.selfLanguage) {
    //         return message;
    //     }
    // }
}
