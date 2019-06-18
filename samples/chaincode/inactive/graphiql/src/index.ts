/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChaincode } from "@prague/runtime-definitions";
import { Document, DataStore } from "@prague/datastore";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import GraphiQL from 'graphiql';
import { buildSchema, graphql } from "graphql";
import { IMap } from "@prague/map";

require("../node_modules/graphiql/graphiql.css");

export class Graphiql extends Document {
    // Initialize the document/component (only called when document is initially created).
    protected async create() {
        await this.root.set("presence", this.createMap());
        await this.root.set("users", this.createMap());
        await this.root.set("graph", this.createString());
    }

    public async opened() {

        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");

        maybeDiv.style.height = "700px";
        if (maybeDiv) {
            ReactDOM.render(
                React.createElement(GraphiQL, {
                    fetcher: this.fetcherFactory(this.root),
                    schema: schema
            } ),  maybeDiv);
        }
    }

    public fetcherFactory(root: IMap): (params: any) => Promise<any> {

        return (params) => {
            const rootJson = root.serialize();
            const rootResolvers = {
                map: (params) => {
                    return rootJson.find((value) => value.key === params.key );
                },
                maps: () => rootJson,
            };

            return graphql(schema, params.query, rootResolvers).then((response) => {
                return response;
            });
        }
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return DataStore.instantiate(new Graphiql());
}

// Public queries are map(key) and maps ** the s is important!
const schema = buildSchema(`
type Map {
    key: String
    type: String
    fields: [ Map ]
}

type Query {
    map(key: String): Map
    maps: [ Map ]
}
`);
