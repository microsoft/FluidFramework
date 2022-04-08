/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import * as Sequence from "@fluidframework/sequence";
import * as ui from "../ui";
import { DockPanel } from "./dockPanel";
import { FlowView } from "./flowView";
import { Title } from "./title";

export class FlowContainer extends ui.Component {
    public title: Title;
    public flowView: FlowView;
    private readonly dockPanel: DockPanel;

    // api.Document should not be used. It should be removed after #2915 is fixed.
    constructor(
        element: HTMLDivElement,
        title: string,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly sharedString: Sequence.SharedString,
    ) {
        super(element);

        // TODO the below code is becoming controller like and probably doesn't belong in a constructor. Likely
        // a better API model.

        // Title bar at the top
        const titleDiv = document.createElement("div");
        titleDiv.id = "title-bar";
        this.title = new Title(titleDiv);
        this.title.setTitle(title);
        this.title.setBackgroundColor(title);

        // FlowView holds the text
        const flowViewDiv = document.createElement("div");
        flowViewDiv.classList.add("flow-view");
        this.flowView = new FlowView(
            flowViewDiv,
            this.runtime,
            this.sharedString,
        );

        this.dockPanel = new DockPanel(this.element);
        this.addChild(this.dockPanel);

        // Use the dock panel to layout the viewport - layer panel as the content and then status bar at the bottom
        this.dockPanel.addTop(this.title);
        this.dockPanel.addContent(this.flowView);
    }

    protected resizeCore(bounds: ui.Rectangle) {
        bounds.conformElement(this.dockPanel.element);
        this.dockPanel.resize(bounds);
    }
}
