/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { AppView, IArrayish, IClient } from "@fluid-experimental/bubblebench-common";
import { SharedTree } from "@fluid-experimental/tree";
import React from "react";
import ReactDOM from "react-dom";
import { TreeObjectProxy } from "./proxy";
import { AppState } from "./state";

interface IApp { clients: IArrayish<IClient>; }

export class Bubblebench extends DataObject implements IFluidHTMLView {
    public static get Name() { return "@fluid-experimental/bubblebench-sharedtree"; }
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
        ReactDOM.render(<AppView app={this.clientManager}></AppView>, div);
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
// eslint-disable-next-line @typescript-eslint/ban-types
export const BubblebenchInstantiationFactory = new DataObjectFactory<Bubblebench, object, undefined, IEvent>(
    Bubblebench.Name,
    Bubblebench,
    [SharedTree.getFactory()],
    {},
);
