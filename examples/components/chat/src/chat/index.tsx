/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { Provider, themes } from "@stardust-ui/react";
import * as React from "react";
import * as ReactDOM from "react-dom";
// eslint-disable-next-line import/no-internal-modules
import { Runtime } from "../runtime/runtime";
import { ChatContainer } from "./chatContainer";

export function renderChat(runtime: Runtime, hostElement: HTMLElement) {
    if (runtime.connected) {
        renderCore(runtime, runtime.opsBeforeConnection, hostElement);
    } else {
        runtime.once("connected", () => renderCore(runtime, runtime.opsBeforeConnection, hostElement));
    }
}

function renderCore(runtime: Runtime, opHistory: ISequencedDocumentMessage[], hostElement: HTMLElement) {
    const user = runtime.clientId? runtime.getQuorum().getMember(runtime.clientId) : undefined;
    const userName = (user?.client.user as any).name;
    ReactDOM.render(
        <Provider theme={themes.teams}>
            <ChatContainer runtime={runtime} clientId={userName} history={opHistory} />
        </Provider>,
        hostElement,
    );
}
