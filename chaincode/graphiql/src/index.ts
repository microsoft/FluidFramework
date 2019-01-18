import { IChaincode } from "@prague/runtime-definitions";
import { Document, DataStore } from "@prague/datastore";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import GraphiQL from 'graphiql';
import { buildSchema, graphql } from "graphql";

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
                    fetcher: this.graphqlBase,
                    schema: schema
            } ),  maybeDiv);
        }
    }

    async graphQLFetcher(params): Promise<{}> {
        if (params) {
            console.error("Ignore params");
        }
        // this.graphqlBase(params).then((response) => {
        //     console.log(response);
        //     return response;
        // })
        return new Promise((resolve) => {

            resolve(root);
        });
    }

    public async graphqlBase(params) {
        console.log(params);
        const query = `
    {
        map(key: "insights") {
          key
          type
          fields {
            key
            type
          }
        }
      }`;
      // map(Key) works. map does not
        console.log(query);
        console.log(params.query);
        return graphql(schema, params.query, rootResolvers).then((response) => {
            console.log(response);
            return response;
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

const rootResolvers = {
    map: (params) => {
        return root.find((value) => value.key === params.key );
    },
    maps: () => root,
};

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

// // TODO: is there a none root resolver?
// const rootResolvers = {
//     map: (params) => {
//         return root.find((value) => value.key === params.key );
//     },
//     maps: () => root,
// };
