/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { Provider, themes } from "@stardust-ui/react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ChatContainer } from "./chatContainer";

export function renderChat(runtime: IComponentRuntime, root: ISharedDirectory, hostElement: HTMLElement) {
    if (runtime.connected) {
        renderCore(runtime, root, hostElement);
    } else {
        runtime.once("connected", () => renderCore(runtime, root, hostElement));
    }
}

function renderCore(runtime: IComponentRuntime, root: ISharedDirectory, hostElement: HTMLElement) {
    const user = runtime.clientId ? runtime.getQuorum().getMember(runtime.clientId) : undefined;
    const userName = (user?.client.user as any).name;
    ReactDOM.render(
        <Provider theme={themes.teams}>
            <ChatContainer runtime={runtime} root={root} clientId={userName} />
        </Provider>,
        hostElement,
    );
}
