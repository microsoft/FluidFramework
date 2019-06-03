import { IPlatform } from "@prague/container-definitions";
import { IComponent } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import * as GraphiQL from "graphiql";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { SharedTextRunner } from "./component";
import { GraphQLService } from "./database";

class ViewPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }

    public async detach() {
        return;
    }
}

// Note on defining components - snapshotting does not seem like it should be part of an IChaincodeComponent given
// these synthetic components don't need it. We may want this to just be "attach"
export class GraphIQLView extends EventEmitter implements IComponent, IPlatform {
    public readonly id = "graphiql";

    constructor(private realComponent: SharedTextRunner) {
        super();
    }

    public async close(): Promise<void> {
        return;
    }

    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }

    public async detach() {
        return;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        // If the host provided a <div>, render the component into that Div
        const maybeDiv = await platform.queryInterface<HTMLDivElement>("div");
        if (!maybeDiv) {
            return;
        }

        maybeDiv.style.width = "100vw";
        maybeDiv.style.height = "100vh";

        // tslint:disable-next-line:no-submodule-imports
        const css = require("graphiql/graphiql.css");
        const styleTag = document.createElement("style");
        styleTag.innerText = css;
        document.head.appendChild(styleTag);

        // To get the base component to fully initialize we attach (so opened is called) and then await the
        // component interface to make sure it has been fully created.
        // TODO should be an easier and cleaner way to do this
        await this.realComponent.attach(new ViewPlatform());
        // await realPlatform.queryInterface("component");

        const graphQLServer = new GraphQLService(this.realComponent.getRoot().get("text"));

        function graphQLFetcher(graphQLParams) {
            return graphQLServer.runQuery(graphQLParams.query, graphQLParams.variables);
        }

        ReactDOM.render(
            React.createElement(
                GraphiQL,
                { fetcher: graphQLFetcher },
            ),
            maybeDiv,
        );

        return this;
    }
}
