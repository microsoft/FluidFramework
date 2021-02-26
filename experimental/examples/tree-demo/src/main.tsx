/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { SharedTree } from "@fluid-experimental/tree";

import React from "react";
import ReactDOM from "react-dom";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AppState } from "./state";
import { AppView } from "./view";
import { IApp, TreeObjectProxy } from "./proxy";

export class TreeDemo extends DataObject implements IFluidHTMLView {
    public static get Name() { return "@fluid-experimental/tree-demo"; }
    private maybeTree?: SharedTree = undefined;
    private maybeClientManager?: AppState = undefined;
    public get IFluidHTMLView() { return this; }

    protected async initializingFirstTime() {
        const tree = this.maybeTree = SharedTree.create(this.runtime);

        const p = TreeObjectProxy<IApp>(tree, tree.currentView.root, tree.applyEdit.bind(tree));
        p.clients = [] as any;

        this.root.set("tree", this.maybeTree.handle);
    }

    protected async initializingFromExisting() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.maybeTree = await this.root.get<IFluidHandle<SharedTree>>("tree")!.get();
    }

    protected async hasInitialized() {
        this.maybeClientManager = new AppState(
            this.tree,
            /* stageWidth: */ 640,
            /* stageHeight: */ 480,
            /* numBubbles: */ 1,
        );

        const onConnected = () => {
            // Out of paranoia, we periodically check to see if your client Id has changed and
            // update the tree if it has.
            setInterval(() => {
                const clientId = this.runtime.clientId;
                if (clientId !== undefined && clientId !== this.clientManager.localClient.clientId) {
                    this.clientManager.localClient.clientId = clientId;
                }
            }, 1000);
        };

        // Wait for connection to begin checking client Id.
        if (this.runtime.connected) {
            onConnected();
        } else {
            this.runtime.once("connected", onConnected);
        }
    }

    public render(div: HTMLElement) {
        ReactDOM.render(<AppView tree={this.tree} app={this.clientManager}></AppView>, div);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    private get tree() { return this.maybeTree!; }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    private get clientManager() { return this.maybeClientManager!; }
}

/**
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const TreeDemoInstantiationFactory = new DataObjectFactory(
    TreeDemo.Name,
    TreeDemo,
    [SharedTree.getFactory()],
    {},
);
