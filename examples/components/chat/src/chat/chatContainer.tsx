/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQuorum, ISequencedDocumentMessage, MessageType } from "@microsoft/fluid-protocol-definitions";
import { Chat } from "@stardust-ui/react";
import * as React from "react";
// eslint-disable-next-line import/no-internal-modules
import { Runtime } from "../runtime/runtime";
import { ChatRenderer } from "./chatRenderer";
import { translate } from "./translator";

const transPrefix = "translate:";

interface IMessage {
    author: string;
    content: string;
    time: string;
    language: string;
    translated: boolean;
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
    private selfLanguage = "en";
    private readonly toLanguages = new Set(["en"]);
    private alreadyLeader = false;

    public componentDidMount() {
        const quorum = this.props.runtime.getQuorum();
        this.initializeTranslator(quorum);

        this.setState({ messages: this.getInitialChat(this.props.history), inputMessage: "" });
        this.props.runtime.on("op", (op: ISequencedDocumentMessage) => {
            const chatProp = this.convertMessage(op);
            if (chatProp) {
                const messages = Object.values(this.state.messages).concat([chatProp]);
                this.setState({ messages });
            }
        });
    }

    public render() {
        // eslint-disable-next-line no-null/no-null
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
                            content={chatProp.message.content}
                            author={chatProp.message.author}
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
            const chatProp = this.convertMessage(op);
            if (chatProp) {
                items.push(chatProp);
            }
        }
        return items;
    }

    public inputChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) =>
        this.setState({ inputMessage: event.target.value });

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
            language: this.selfLanguage,
            time: Date.now().toString(),
            translated: false,
        });
    };

    private convertMessage(op: ISequencedDocumentMessage): IChatProps | undefined {
        const message: IMessage = op.contents;
        if (message.content.startsWith(transPrefix)) {
            const lang = message.content.substr(transPrefix.length);
            if (message.author === this.props.clientId) {
                this.selfLanguage = lang;
            }
            this.toLanguages.add(lang);
            return { message };
        } else if (message.author === this.props.clientId) {
            if (!message.translated) {
                return { message };
            }
        } else if (message.language === this.selfLanguage) {
            return { message };
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
