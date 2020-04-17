/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { Inject, Injectable } from "@angular/core";
import { ISharedMap } from "@microsoft/fluid-map";
import {
    graphql, parse, subscribe, ExecutionResult,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
} from "graphql";
import { PubSub } from "graphql-subscriptions";
import { from, Observable, of } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { Hero } from "./hero";
import { MessageService } from "./message.service";
import { PRAGUE_ROOT } from "./tokens";

// Example of how to manually build a GraphQL Schema at https://github.com/graphql/graphql-js/ including

const prefix = "/heroes/";

export class GraphQLService {
    private readonly schema: GraphQLSchema;
    private readonly heroEmitter = new EventEmitter();
    private readonly heroPubSub = new PubSub({ eventEmitter: this.heroEmitter });

    constructor(private readonly root: ISharedMap) {
        // Type Hero {
        //     id: Int!
        //     name: String!
        // }
        const heroType = new GraphQLObjectType({
            name: "Hero",
            description: "A superhero",
            fields: () => ({
                id: {
                    type: GraphQLNonNull(GraphQLInt),
                    description: "The super hero ID",
                },
                name: {
                    type: GraphQLNonNull(GraphQLString),
                    description: "The name of the human.",
                },
            }),
        });

        // Type Query {
        //     heroes: [Character!]!
        // }
        const queryType = new GraphQLObjectType({
            name: "Query",
            fields: () => ({
                heroes: {
                    type: GraphQLList(heroType),
                    args: {
                        id: {
                            description:
                                // eslint-disable-next-line max-len
                                "If omitted, returns all the heroes. If provided, returns the hero of that particular id.",
                            type: GraphQLInt,
                        },
                    },
                    // eslint-disable-next-line no-shadow
                    resolve: (root, { id }) => {
                        if (!id) {
                            return Promise.resolve(this.getAllHeroes());
                        }

                        const key = `${prefix}${id}`;
                        if (!this.root.has(key)) {
                            return [];
                        }

                        return [{
                            id,
                            name: this.root.get(key),
                        }];
                    },
                },
            }),
        });

        const mutation = new GraphQLObjectType({
            fields: {
                renameHero: {
                    type: heroType,
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
                        if (!this.root.has(key)) {
                            return Promise.reject("Hero not found");
                        }

                        this.root.set(key, name);
                        return Promise.resolve({ id, name });
                    },
                },
            },
            name: "Mutation",
        });

        // Type Subscription {
        //     herosUpdate: Character!
        //     heroUpdate(id: Int)
        // }
        const subscription = new GraphQLObjectType({
            name: "HeroesSubscription",
            fields: () => ({
                heroesUpdate: {
                    type: GraphQLList(heroType),
                    // eslint-disable-next-line @typescript-eslint/promise-function-async
                    resolve: (found) => Promise.resolve(this.getAllHeroes()),
                    subscribe: () => {
                        const iterator = this.heroPubSub.asyncIterator("valueChanged");
                        process.nextTick(() => this.heroEmitter.emit("valueChanged", { local: false }));

                        return iterator;
                    },
                },
                heroUpdate: {
                    type: heroType,
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
                        process.nextTick(() => {
                            this.heroEmitter.emit(
                                key,
                                {
                                    key,
                                    local: false,
                                    value: this.root.get(key),
                                });
                        });

                        return iterator;
                    },
                },
            }),
        });

        this.schema = new GraphQLSchema({
            query: queryType,
            mutation,
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

    // eslint-disable-next-line @typescript-eslint/promise-function-async
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
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (response) => response.errors ? Promise.reject(response.errors) : Promise.resolve(response.data.heroes));

        return queryP;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public runQuery(query, variables) {
        return graphql({
            schema: this.schema,
            variableValues: variables,
            source: query,
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
            schema: this.schema,
            document: query,
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
            schema: this.schema,
            document: query,
            variableValues: { id },
        });
        return value as AsyncIterator<ExecutionResult<{ heroUpdate: Hero }>>;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
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
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (response) => response.errors ? Promise.reject(response.errors) : Promise.resolve(response.data.heroes[0]));

        return queryP;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
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
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (response) =>
                response.errors ? Promise.reject(response.errors) : Promise.resolve(response.data.renameHero),
        );

        return queryP;
    }

    private getAllHeroes(): Hero[] {
        const heroes = new Array<Hero>();
        for (const key of this.root.keys()) {
            if (key.startsWith(prefix)) {
                heroes.push({
                    id: parseInt(key.substr(prefix.length), 10),
                    name: this.root.get(key),
                });
            }
        }

        return heroes;
    }
}

@Injectable({ providedIn: "root" })
export class HeroService {
    private readonly graphQLService: GraphQLService;

    constructor(@Inject(PRAGUE_ROOT) root: ISharedMap, private readonly messageService: MessageService) {
        this.graphQLService = new GraphQLService(root);
    }

    /** GET heroes from the server */
    getHeroes(): Observable<Hero[]> {
        return new Observable((subscriber) => {
            this.graphQLService.subscribeHeroes().then(
                async (iterator) => {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const value = await iterator.next();
                        if (value.done) {
                            break;
                        }

                        subscriber.next(value.value.data.heroesUpdate);
                    }
                },
                (error) => {
                    subscriber.error(error);
                });
        });
    }

    /** GET hero by id. Will 404 if id not found */
    getHero(id: number): Observable<Hero> {
        return new Observable((subscriber) => {
            this.graphQLService.subscribeHero(id).then(
                async (iterator) => {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const value = await iterator.next();
                        if (value.done) {
                            break;
                        }

                        subscriber.next(value.value.data.heroUpdate);
                    }
                },
                (error) => {
                    subscriber.error(error);
                });
        });
    }

    /* GET heroes whose name contains search term */
    searchHeroes(term: string): Observable<Hero[]> {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    //////// Save methods //////////

    /** POST: add a new hero to the server */
    addHero(hero: Hero): Observable<Hero> {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    /** DELETE: delete the hero from the server */
    deleteHero(hero: Hero | number): Observable<Hero> {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    /** PUT: update the hero on the server */
    updateHero(hero: Hero): Observable<any> {
        const queryP = this.graphQLService.updateHero(hero);

        return from(queryP).pipe(
            tap((_) => this.log(`updated hero id=${hero.id}`)),
            catchError(this.handleError<any>("updateHero")),
        );
    }

    /**
     * Handle Http operation that failed.
     * Let the app continue.
     * @param operation - name of the operation that failed
     * @param result - optional value to return as the observable result
     */
    private handleError<T>(operation = "operation", result?: T) {
        return (error: any): Observable<T> => {
            // TODO: send the error to remote logging infrastructure
            console.error(error); // Log to console instead

            // TODO: better job of transforming error for user consumption
            this.log(`${operation} failed: ${error.message}`);

            // Let the app keep running by returning an empty result.
            return of(result);
        };
    }

    /** Log a HeroService message with the MessageService */
    private log(message: string) {
        this.messageService.add(`HeroService: ${message}`);
    }
}
