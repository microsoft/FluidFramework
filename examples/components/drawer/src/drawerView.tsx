/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { mergeStyles } from "office-ui-fabric-react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { IDocumentFactory } from "@microsoft/fluid-host-service-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { IComponentHTMLOptions, IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { DocumentList } from "./documentList";
import { DrawerCommandBar } from "./drawerCommandBar";

// Inject some global styles
mergeStyles({
    selectors: {
        ":global(body), :global(html), :global(#app)": {
            margin: 0,
            padding: 0,
            height: "100vh",
        },
    },
});

export class DrawerView implements IComponentHTMLView {
    private packages: { pkg: string; name: string; version: string; icon: string }[] = [];
    private elm: HTMLElement;

    public get IComponentHTMLView() { return this; }

    constructor(
        private readonly documentsFactory: IDocumentFactory,
        private readonly documentsMap: ISharedMap,
        private readonly context: IComponentContext,
        packagesP: Promise<{ pkg: string; name: string; version: string; icon: string }[]>,
        public remove: () => void,
    ) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        packagesP.then((packages) => {
            this.packages = packages;
            this.renderCore();
        });
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        this.elm = elm;
        this.renderCore();
    }

    private renderCore() {
        ReactDOM.render(
            <div>
                <DrawerCommandBar
                    context={this.context}
                    packages={this.packages}
                    documentFactory={this.documentsFactory}
                    documentsMap={this.documentsMap}
                />
                <DocumentList values={this.documentsMap} />
            </div>,
            this.elm);
    }
}
