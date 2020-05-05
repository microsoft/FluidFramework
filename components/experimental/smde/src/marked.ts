/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@microsoft/fluid-sequence";
import * as marked from "marked";

export class Viewer {
    constructor(private readonly elm: HTMLElement, private readonly text: SharedString) {
    }

    public render() {
        this.elm.innerHTML = marked(this.getText());
        this.text.on("sequenceDelta", () => {
            this.elm.innerHTML = marked(this.getText());
        });
    }

    private getText(): string {
        const { parallelText } = this.text.getTextAndMarkers("pg");
        return parallelText.join("\n");
    }
}
