/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import * as GraphiQL from "graphiql";
import React from "react";
import ReactDOM from "react-dom";
import { GraphQLService } from "./database";

// Note on defining components - snapshotting does not seem like it should be part of an IChaincodeComponent given
// these synthetic components don't need it. We may want this to just be "attach"
export class GraphIQLView extends EventEmitter implements IFluidHTMLView {
    public readonly id = "graphiql";

    public get IFluidHTMLView() { return this; }

    constructor(private readonly map: ISharedMap, private readonly sharedString: SharedString) {
        super();
    }

    public render(element: HTMLElement) {
        const graphQLDiv = document.createElement("div");
        element.appendChild(graphQLDiv);

        graphQLDiv.style.width = "100vw";
        graphQLDiv.style.height = "100vh";

        // eslint-disable-next-line max-len
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, import/no-internal-modules
        const css = require("graphiql/graphiql.css");
        const styleTag = document.createElement("style");
        styleTag.innerText = css;
        document.head.appendChild(styleTag);

        const graphQLServer = new GraphQLService(
            this.map,
            this.sharedString);

        const graphQLFetcher = async (graphQLParams) =>
            graphQLServer.runQuery(graphQLParams.query, graphQLParams.variables);

        ReactDOM.render(
            React.createElement(
                GraphiQL,
                { fetcher: graphQLFetcher },
            ),
            graphQLDiv,
        );
    }
}
