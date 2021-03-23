/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MonacoRunner } from "./chaincode";

export const MonacoRunnerView = (elm: HTMLElement, model: MonacoRunner) => {
    let mapHost: HTMLElement | undefined;

    if (!mapHost) {
        mapHost = document.createElement("div");
        const toggleButton = document.createElement("button");
        toggleButton.textContent = "Click";
        toggleButton.addEventListener("click", (e) => model.changeModelLang("html"));
        elm.appendChild(toggleButton);
        elm.appendChild(mapHost);

        initializeDiv(mapHost);
        model.initializeEditor(
            mapHost,
            {language: "typescript"},
        ).catch((error) => { console.error(error); });
    } else {
        if (mapHost.parentElement !== elm) {
            mapHost.remove();
            elm.appendChild(mapHost);
        }
    }
};

const initializeDiv = (mapHost) => {
    mapHost.style.minHeight = "480px";
    mapHost.style.width = "100%";
    mapHost.style.height = "90%";
};
