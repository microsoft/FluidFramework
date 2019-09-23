/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import { EventEmitter } from "events";
import * as GraphiQL from "graphiql";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { GraphQLService } from "./database";

// Note on defining components - snapshotting does not seem like it should be part of an IChaincodeComponent given
// these synthetic components don't need it. We may want this to just be "attach"
export class GraphIQLView extends EventEmitter implements IComponentHTMLVisual {
    public readonly id = "graphiql";

    public get IComponentHTMLVisual() { return this; }

    constructor(private map: ISharedMap, private sharedString: SharedString) {
        super();
    }

    public render(element: HTMLElement) {
        const graphQLDiv = document.createElement("div");
        element.appendChild(graphQLDiv);

        graphQLDiv.style.width = "100vw";
        graphQLDiv.style.height = "100vh";

        // tslint:disable-next-line:no-submodule-imports
        const css = require("graphiql/graphiql.css");
        const styleTag = document.createElement("style");
        styleTag.innerText = css;
        document.head.appendChild(styleTag);

        const graphQLServer = new GraphQLService(
            this.map,
            this.sharedString);

        function graphQLFetcher(graphQLParams) {
            return graphQLServer.runQuery(graphQLParams.query, graphQLParams.variables);
        }

        ReactDOM.render(
            React.createElement(
                GraphiQL,
                { fetcher: graphQLFetcher },
            ),
            graphQLDiv,
        );
    }
}
