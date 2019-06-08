import { IComponent, IComponentHTMLViewable, IHTMLView } from "@prague/container-definitions";
import { EventEmitter } from "events";
import * as GraphiQL from "graphiql";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { SharedTextRunner } from "./component";
import { GraphQLService } from "./database";

// Note on defining components - snapshotting does not seem like it should be part of an IChaincodeComponent given
// these synthetic components don't need it. We may want this to just be "attach"
export class GraphIQLView extends EventEmitter implements IComponent, IComponentHTMLViewable {
    public static supportedInterfaces = ["IComponentHTMLViewable"];

    public readonly id = "graphiql";

    constructor(private realComponent: SharedTextRunner) {
        super();
    }

    public async query(id: string): Promise<any> {
        return GraphIQLView.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public async list(): Promise<string[]> {
        return GraphIQLView.supportedInterfaces;
    }

    public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {
        const graphQLDiv = document.createElement("div");
        element.appendChild(graphQLDiv);

        graphQLDiv.style.width = "100vw";
        graphQLDiv.style.height = "100vh";

        // tslint:disable-next-line:no-submodule-imports
        const css = require("graphiql/graphiql.css");
        const styleTag = document.createElement("style");
        styleTag.innerText = css;
        document.head.appendChild(styleTag);

        const graphQLServer = new GraphQLService(this.realComponent.getRoot().get("text"));

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

        return {
            remove: () => { },
        };
    }
}
