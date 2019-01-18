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
        let users = await this.root.wait<IMap>("users");

        console.log(users);
        await this.root.get("users");
        await this.serializable();

        maybeDiv.style.height = "700px";
        if (maybeDiv) {
            ReactDOM.render(
                React.createElement(GraphiQL, {
                    fetcher: this.fetcherFactory(this.root),
                    schema: schema
            } ),  maybeDiv);
        }
    }

    public async serializable() {
        root = this.root.serialize();
        return root;
    }

    public fetcherFactory(root: IMap): (params: any) => Promise<any> {
        let rootLocal = this.root;
        return (params) => {
            const rootJson = rootLocal.serialize();
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

    public async graphqlBase(params) {
        // console.log(this.root.serialize());
        const rootJson = this.root.serialize();
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

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return DataStore.instantiate(new Graphiql());
}

// const rootResolvers = {
//     map: (params) => {
//         return root.find((value) => value.key === params.key );
//     },
//     maps: () => root,
// };

let root = [
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
