/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISharedMap } from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import { SharedString } from "@fluidframework/sequence";
import {
    ExecutionResult,
    graphql,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
    parse,
    subscribe,
} from "graphql";
import { PubSub } from "graphql-subscriptions";

// Example of how to manually build a GraphQL Schema at https://github.com/graphql/graphql-js/ including

const prefix = "/heroes/";

export class Hero {
    public id: number;
    public name: string;
}

export class GraphQLService {
    private readonly schema: GraphQLSchema;
    private readonly heroEmitter = new EventEmitter();
    private readonly heroPubSub = new PubSub({ eventEmitter: this.heroEmitter });

    constructor(private readonly map: ISharedMap, sharedString: SharedString) {
        const heroType = new GraphQLObjectType({
            description: "A superhero",
            fields: () => ({
                id: {
                    description: "The super hero ID",
                    type: GraphQLNonNull(GraphQLInt),
                },
                name: {
                    description: "The name of the human.",
                    type: GraphQLNonNull(GraphQLString),
                },
            }),
            name: "Hero",
        });

        const paragraphType = new GraphQLObjectType({
            description: "A superhero",
            fields: () => ({
                text: {
                    description: "Text of the paragraph.",
                    type: GraphQLNonNull(GraphQLString),
                },
            }),
            name: "Paragraph",
        });

        const queryType = new GraphQLObjectType({
            fields: () => ({
                paragraphs: {
                    args: {
                        id: {
                            description:
                                // eslint-disable-next-line max-len
                                "If omitted, returns all the heroes. If provided, returns the hero of that particular id.",
                            type: GraphQLInt,
                        },
                    },
                    resolve: (obj, { id }) => {
                        let lastStart = 0;
                        const pgs: any[] = [];

                        function leaf(
                            segment: MergeTree.ISegment,
                            pos: number,
                        ) {
                            if (MergeTree.Marker.is(segment)) {
                                if (segment.refType === MergeTree.ReferenceType.Tile && segment.hasTileLabel("pg")) {
                                    pgs.push({ text: sharedString.getText(lastStart, pos) });
                                    lastStart = pos + 1;
                                }
                            }

                            return true;
                        }

                        sharedString.walkSegments(leaf);
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return pgs;
                    },
                    type: GraphQLList(paragraphType),
                },
            }),
            name: "Query",
        });

        const mutation = new GraphQLObjectType({
            fields: {
                renameHero: {
                    args: {
                        id: {
                            description: "Id for the hero to update",
                            type: GraphQLNonNull(GraphQLInt),
                        },
                        name: {
                            description: "Updated name for the hero",
                            type: GraphQLNonNull(GraphQLString),
                        },
                    },
                    // eslint-disable-next-line @typescript-eslint/promise-function-async
                    resolve: (obj, { id, name }) => {
                        const key = `${prefix}${id}`;
                        if (!this.map.has(key)) {
                            return Promise.reject(new Error("Hero not found"));
                        }

                        this.map.set(key, name);
                        return Promise.resolve({ id, name });
                    },
                    type: heroType,
                },
            },
            name: "Mutation",
        });

        const subscription = new GraphQLObjectType({
            fields: () => ({
                heroUpdate: {
                    args: {
                        id: {
                            description: "Id for the hero to listen to updates on",
                            type: GraphQLNonNull(GraphQLInt),
                        },
                    },
                    // eslint-disable-next-line @typescript-eslint/promise-function-async
                    resolve: (found) => {
                        const key = found.key as string;
                        const id = parseInt(key.substring(key.lastIndexOf("/") + 1), 10);
                        return Promise.resolve({ id, name: found.value });
                    },
                    subscribe: (obj, { id }) => {
                        const iterator = this.heroPubSub.asyncIterator(`${prefix}${id}`);
                        const key = `${prefix}${id}`;

                        // Synthesize an emit to trigger an initial value to the iterator. This will cause a
                        // subscribe event across any other existing subscriptions. Better would be to create
                        // a custom iterator.
                        this.heroEmitter.emit(
                            key,
                            {
                                key,
                                local: false,
                                value: this.map.get(key),
                            });

                        return iterator;
                    },
                    type: heroType,
                },
                heroesUpdate: {
                    // eslint-disable-next-line @typescript-eslint/promise-function-async
                    resolve: (found) => Promise.resolve(this.getAllHeroes()),
                    subscribe: () => {
                        const iterator = this.heroPubSub.asyncIterator("valueChanged");
                        this.heroEmitter.emit("valueChanged", { local: false });

                        return iterator;
                    },
                    type: GraphQLList(heroType),
                },
            }),
            name: "HeroesSubscription",
        });

        this.schema = new GraphQLSchema({
            mutation,
            query: queryType,
            subscription,
        });

        this.map.on("valueChanged", (changed, local) => {
            this.heroEmitter.emit("valueChanged", { local });
            this.heroEmitter.emit(
                changed.key,
                {
                    key: changed.key,
                    local,
                    value: this.map.get(changed.key),
                });
        });
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getHeroes() {
        const query =
            `
                {
                    heroes {
                        id
                        name
                    }
                }
            `;

        const queryP = graphql(this.schema, query).then(
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (response) => response.errors
                ? Promise.reject(response.errors)
                : Promise.resolve(response.data.heroes));

        return queryP as Promise<Hero[]>;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public runQuery<T>(query, variables) {
        return graphql({
            schema: this.schema,
            source: query,
            variableValues: variables,
        }) as Promise<ExecutionResult<T>>;
    }

    public async subscribeHeroes(): Promise<AsyncIterator<ExecutionResult<{ heroesUpdate: Hero[] }>>> {
        const query =
            parse(`
                subscription SubscribeToHeroes {
                    heroesUpdate {
                        id
                        name
                    }
                }
            `);

        const value = await subscribe({
            document: query,
            schema: this.schema,
        });
        return value as AsyncIterator<ExecutionResult<{ heroesUpdate: Hero[] }>>;
    }

    public async subscribeHero(id: number): Promise<AsyncIterator<ExecutionResult<{ heroUpdate: Hero }>>> {
        const query =
            parse(`
                subscription SubscribeToHero($id: Int!) {
                    heroUpdate(id: $id) {
                        id
                        name
                    }
                }
            `);

        const value = await subscribe({
            document: query,
            schema: this.schema,
            variableValues: { id },
        });
        return value as AsyncIterator<ExecutionResult<{ heroUpdate: Hero }>>;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getHero(id: number) {
        const query =
            `
                {
                    heroes(id: ${id}) {
                        id
                        name
                    }
                }
            `;
        const queryP = graphql(this.schema, query).then(
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (response) => response.errors
                ? Promise.reject(response.errors)
                : Promise.resolve(response.data.heroes[0]));

        return queryP as Promise<Hero>;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public updateHero(hero: Hero) {
        const query =
            `
                mutation Rename($id: Int!, $name: String!) {
                    renameHero(id: $id, name: $name) {
                        id
                        name
                    }
                }
            `;
        const variableValues = {
            id: hero.id,
            name: hero.name,
        };
        const queryP = graphql({ schema: this.schema, source: query, variableValues }).then(
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (response) => response.errors
                ? Promise.reject(response.errors)
                : Promise.resolve(response.data.renameHero));

        return queryP as Promise<Hero>;
    }

    private getAllHeroes(): Hero[] {
        const heroes: Hero[] = [];
        for (const key of this.map.keys()) {
            if (key.startsWith(prefix)) {
                heroes.push({
                    id: parseInt(key.substr(prefix.length), 10),
                    name: this.map.get(key),
                });
            }
        }

        return heroes;
    }
}
