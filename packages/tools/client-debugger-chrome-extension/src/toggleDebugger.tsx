/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { DebuggerPanel, panelClassName } from "./debuggerPanel";

/**
 * Toggles the debugger UI. If not currently displayed, will open it. Otherwise, will close it.
 *
 * @returns Whether or not the extension is now displayed.
 */
async function toggleDebugView(): Promise<boolean> {
    // eslint-disable-next-line unicorn/prefer-query-selector
    const matches = document.body.getElementsByClassName(panelClassName);
    if (matches.length === 0) {
        const element = document.createElement("div");
        element.className = panelClassName;
        document.body.append(element);

        ReactDOM.render(<DebuggerPanel />, element);

        return true;
    } else {
        for (const element of matches) {
            element.remove();
        }

        return false;
    }
}

toggleDebugView().then(
    (visible: boolean) => {
        if (visible) {
            console.log("Fluid debugger extension launched.");
        } else {
            console.log("Fluid debugger extension closed.");
        }
    },
    (error) => {
        throw error;
    },
);
