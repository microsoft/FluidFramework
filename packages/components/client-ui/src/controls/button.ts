/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ui from "../ui";

/**
 * Stack panel
 */
export class Button extends ui.Component {
    constructor(element: HTMLDivElement, private desiredSize: ui.ISize, classList: string[]) {
        super(element);
        const button = document.createElement("button");
        button.classList.add(...classList);
        element.appendChild(button);

        button.onclick = (mouseEvent: MouseEvent) => {
            this.emit("click", mouseEvent);
        };
    }

    /**
     * Returns a size whose height is capped to the max child height
     */
    public measure(size: ui.ISize): ui.ISize {
        return {
            height: Math.min(size.height, this.desiredSize.height),
            width: Math.min(size.width, this.desiredSize.width),
        };
    }
}
