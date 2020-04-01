/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import {
    PrimedComponent, PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";

import { renderChat } from "./chat";

export const MessagesKey = "messages";

export interface IMessage {
    author: string;
    content: string;
    time: string;
    translated: boolean;
}

export class Chat extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly factory = new PrimedComponentFactory(Chat, []);

    public static getFactory() {
        return Chat.factory;
    }

    async componentInitializingFirstTime() {
        this.root.set<IMessage[]>(MessagesKey, []);
    }

    async componentHasInitialized() {
        this.root.get("messages");
    }

    public render(elm: HTMLElement) {
        renderChat(this.runtime, this.root, elm);
    }
}

export const fluidExport = Chat.getFactory();
