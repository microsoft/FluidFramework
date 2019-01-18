import { IChaincode } from "@prague/runtime-definitions";
import { Document, DataStore } from "@prague/datastore";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import GraphiQL from 'graphiql';
import { buildSchema } from "graphql";

require("../node_modules/graphiql/graphiql.css");

export class Graphiql extends Document {
    // Initialize the document/component (only called when document is initially created).
    protected async create() {
    }

    public async opened() {

        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        maybeDiv.style.height = "700px";
        if (maybeDiv) {
            ReactDOM.render(
                React.createElement(GraphiQL, {
                    fetcher: this.graphQLFetcher,
                    schema: schema
            } ),  maybeDiv);
        }
    }

    async graphQLFetcher(params) {
        if (params) {
            console.error("Ignore params");
        }
        return new Promise((resolve) => {
            resolve(root);
        });
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return DataStore.instantiate(new Graphiql());
}

const root = [
    {
        key: "insights",
        type: "map",
        fields: [
            {
                key: "translations",
                type: "map",
                fields: [
                    {
                        greek: "this is greek"
                    }
                ]
            },
            {
                key: "TextAnalytics",
                type: "map",
                fields: [
                    {
                        keyPhrases: "a"
                    }
                ]
            },{
                key: "Special Value",
                type: "scalar",
                value: 12
            }
        ]
    },
    {
        key: "presence",
        type: "map",
        fields: [
            {
                key: "users",
                type: "map",
                fields: [
                    {
                        name: "sam"
                    }
                ]
            },
        ]
    }
];

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

// // TODO: is there a none root resolver?
// const rootResolvers = {
//     map: (params) => {
//         return root.find((value) => value.key === params.key );
//     },
//     maps: () => root,
// };
