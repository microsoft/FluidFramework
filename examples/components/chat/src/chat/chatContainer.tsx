/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQuorum, ISequencedDocumentMessage, MessageType } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import { Chat } from "@stardust-ui/react";
import * as React from "react";
import { ChatRenderer } from "./chatRenderer";
import { translate } from "./translator";
import { IMessage, MessagesKey } from "..";

const transPrefix = "translate:";

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
    private selfLanguage = "en";
    private readonly toLanguages = new Set(["en"]);
    private alreadyLeader = false;

    constructor(props: IChatContainerProps) {
        super(props);
        const {root, runtime} = props;
        const quorum = runtime.getQuorum();
        this.initializeTranslator(quorum);

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
        const items: IMessage[] = [];
        for (const message of oldMessages) {
            const convertedMessage = this.convertMessage(message);
            if (convertedMessage) {
                items.push(convertedMessage);
            }
        }
        return items;
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
            language: this.selfLanguage,
            time: Date.now().toString(),
            translated: false,
        };
        const newMessages = [...this.state.messages, newMessage];
        root.set(MessagesKey, newMessages);
    };

    private convertMessage(message: IMessage): IMessage | undefined {
        if (message.content.startsWith(transPrefix)) {
            const lang = message.content.substr(transPrefix.length);
            if (message.author === this.props.clientId) {
                this.selfLanguage = lang;
            }
            this.toLanguages.add(lang);
            return message;
        } else if (message.author === this.props.clientId) {
            if (!message.translated) {
                return message;
            }
        } else if (message.language === this.selfLanguage) {
            return message;
        }
    }

    private initializeTranslator(quorum: IQuorum) {
        this.runTranslationIfLeader(quorum);
        quorum.on("addMember", () => {
            this.runTranslationIfLeader(quorum);
        });
        quorum.on("removeMember", () => {
            this.runTranslationIfLeader(quorum);
        });
    }

    private runTranslationIfLeader(quorum: IQuorum) {
        const clientId = this.props.runtime.clientId;
        const members = [...quorum.getMembers()];

        if (members && members.length > 0 && members[0][0] === clientId && !this.alreadyLeader) {
            this.alreadyLeader = true;
            console.log(`${clientId} translating ops!`);
            this.translateOp();
        }
    }

    private translateOp() {
        this.props.runtime.on("op", (op: ISequencedDocumentMessage) => {
            const message = op.contents as IMessage;
            if (!message.translated && !message.content.startsWith(transPrefix)) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                translate("api_key", message.language, [...this.toLanguages], [message.content]).then((val) => {
                    if (val) {
                        for (const languageTranslations of val) {
                            const language = languageTranslations[0];
                            const translations = languageTranslations[1];
                            this.props.runtime.submitMessage(MessageType.Operation, {
                                author: message.author,
                                content: translations[0],
                                language,
                                time: Date.now().toString(),
                                translated: true,
                            });
                        }
                    }
                });
            }
        });
    }
}
