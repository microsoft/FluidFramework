/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Toggles the debugger UI. If not currently displayed, will open it. Otherwise, will close it.
 *
 * @returns Whether or not the extension is now displayed.
 */
async function toggleDebugView(): Promise<boolean> {
    const panelClassName = "fluid-debug-view-panel";
    // eslint-disable-next-line unicorn/prefer-query-selector
    const matches = document.body.getElementsByClassName(panelClassName);
    if (matches.length === 0) {
        const debugViewElement = document.createElement("div");
        debugViewElement.textContent = "TODO";
        debugViewElement.className = panelClassName;
        debugViewElement.style.position = "fixed";
        debugViewElement.style.width = "400px";
        debugViewElement.style.height = "100%";
        debugViewElement.style.top = "0px";
        debugViewElement.style.right = "0px";
        debugViewElement.style.zIndex = "999999999";

        document.body.append(debugViewElement);

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
