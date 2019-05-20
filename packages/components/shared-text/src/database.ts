import * as MergeTree from "@prague/merge-tree";
import { SharedString } from "@prague/sequence";
import { EventEmitter } from "events";
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
    private schema: GraphQLSchema;
    private heroEmitter = new EventEmitter();
    private heroPubSub = new PubSub({ eventEmitter: this.heroEmitter });

    constructor(private root: SharedString) {
        // type Hero {
        //     id: Int!
        //     name: String!
        // }
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

        // type Query {
        //     heroes: [Character!]!
        // }
        const queryType = new GraphQLObjectType({
            fields: () => ({
                paragraphs: {
                    args: {
                        id: {
                            description:
                            "If omitted, returns all the heroes. If provided, returns the hero of that particular id.",
                            type: GraphQLInt,
                        },
                    },
                    resolve: (obj, { id }) => {
                        let lastStart = 0;
                        const pgs = new Array<any>();

                        function leaf(
                            segment: MergeTree.ISegment,
                            pos: number,
                            refSeq: number,
                            clientId: number,
                            start: number,
                            end: number,
                        ) {
                            if (MergeTree.Marker.is(segment)) {
                                if (segment.refType === MergeTree.ReferenceType.Tile && segment.hasTileLabel("pg")) {
                                    pgs.push({ text: root.getText(lastStart, pos) });
                                    lastStart = pos + 1;
                                }
                            }

                            return true;
                        }
                        root.client.mergeTree.mapRange(
                            { leaf },
                            MergeTree.UniversalSequenceNumber,
                            root.client.getClientId());

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
                    resolve: (obj, { id, name }) => {
                        const key = `${prefix}${id}`;
                        if (!this.root.has(key)) {
                            return Promise.reject("Hero not found");
                        }

                        this.root.set(key, name);
                        return Promise.resolve({ id, name });
                    },
                    type: heroType,
                },
            },
            name: "Mutation",
        });

        // type Subscription {
        //     herosUpdate: Character!
        //     heroUpdate(id: Int)
        // }
        const subscription = new GraphQLObjectType({
            fields: () => ({
                heroUpdate: {
                    args: {
                        id: {
                            description: "Id for the hero to listen to updates on",
                            type: GraphQLNonNull(GraphQLInt),
                        },
                    },
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
                                value: this.root.get(key),
                            });

                        return iterator;
                    },
                    type: heroType,
                },
                heroesUpdate: {
                    resolve: (found) => {
                        return Promise.resolve(this.getAllHeroes());
                    },
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

        this.root.on("valueChanged", (changed, local) => {
            this.heroEmitter.emit("valueChanged", { local });
            this.heroEmitter.emit(
                changed.key,
                {
                    key: changed.key,
                    local,
                    value: this.root.get(changed.key),
                });
        });
    }

    public getHeroes(): Promise<Hero[]> {
        const query =
            `
                {
                    heroes {
                        id
                        name
                    }
                }
            `;

        const queryP = graphql<{ heroes: Hero[] }>(this.schema, query).then(
            (response) => response.errors ? Promise.reject(response.errors) : Promise.resolve(response.data.heroes));

        return queryP;
    }

    public runQuery<T>(query, variables): Promise<ExecutionResult<T>> {
        return graphql({
            schema: this.schema,
            source: query,
            variableValues: variables,
        });
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

        const value = await subscribe<{ heroUpdate: Hero }>({
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

        const value = await subscribe<{ heroUpdate: Hero }>({
            document: query,
            schema: this.schema,
            variableValues: { id },
        });
        return value as AsyncIterator<ExecutionResult<{ heroUpdate: Hero }>>;
    }

    public getHero(id: number): Promise<Hero> {
        const query =
            `
                {
                    heroes(id: ${id}) {
                        id
                        name
                    }
                }
            `;
        const queryP = graphql<{ heroes: Hero[] }>(this.schema, query).then(
            (response) => response.errors ? Promise.reject(response.errors) : Promise.resolve(response.data.heroes[0]));

        return queryP;
    }

    public updateHero(hero: Hero): Promise<Hero> {
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
        const queryP = graphql<{ renameHero: Hero }>({ schema: this.schema, source: query, variableValues }).then(
            (response) => response.errors
                ? Promise.reject(response.errors)
                : Promise.resolve(response.data.renameHero));

        return queryP;
    }

    private getAllHeroes(): Hero[] {
        const heroes = new Array<Hero>();
        for (const key of this.root.keys()) {
            if (key.indexOf(prefix) === 0) {
                heroes.push({
                    id: parseInt(key.substr(prefix.length), 10),
                    name: this.root.get(key),
                });
            }
        }

        return heroes;
    }
}
