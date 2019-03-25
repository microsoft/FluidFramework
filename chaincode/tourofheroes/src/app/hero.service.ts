import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { graphql } from "graphql";
import { from, Observable, of } from 'rxjs';
import {
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
} from "graphql";
import { catchError, tap } from 'rxjs/operators';
import { Hero } from './hero';
import { MessageService } from './message.service';

// Example of how to manually build a GraphQL Schema at https://github.com/graphql/graphql-js/

// type Hero {
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
            type: GraphQLString,
            description: 'The name of the human.',
        }
    }),
});

// type Query {
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
                        "If omitted, returns all the heroes. If provided, returns the hero of that particular id.",
                    type: GraphQLInt,
                },
            },
            resolve: (root, { id }) => {
                const heroes = [
                    { id: 11, name: 'Mr. Nice' },
                    { id: 12, name: 'Narco' },
                    { id: 13, name: 'Bombasto' },
                    { id: 14, name: 'Celeritas' },
                    { id: 15, name: 'Magneta' },
                    { id: 16, name: 'RubberMan' },
                    { id: 17, name: 'Dynama' },
                    { id: 18, name: 'Dr IQ' },
                    { id: 19, name: 'Magma' },
                    { id: 20, name: 'Tornado' }
                ];

                if (id) {
                    const found = heroes.find((value) => value.id === id);
                    return Promise.resolve(found ? [found] : []);
                } else {
                    return Promise.resolve(heroes);
                }
            },
        }
    }),
});

const schema = new GraphQLSchema({
    query: queryType
});

const httpOptions = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json' })
};

@Injectable({ providedIn: 'root' })
export class HeroService {
    private heroesUrl = 'api/heroes';  // URL to web api

    constructor(
        private http: HttpClient,
        private messageService: MessageService) { }

    /** GET heroes from the server */
    getHeroes(): Observable<Hero[]> {
        const query =
            `
                {
                    heroes {
                        id
                        name
                    }
                }
            `;

        const queryP = graphql<{ heroes: Hero[] }>(schema, query).then(
            (response) => response.errors ? Promise.reject(response.errors) : Promise.resolve(response.data.heroes));

        return from(queryP)
            .pipe(
                tap(_ => this.log('fetched heroes')),
                catchError(this.handleError('getHeroes', []))
            );
    }

    /** GET hero by id. Will 404 if id not found */
    getHero(id: number): Observable<Hero> {
        const query =
            `
                {
                    heroes(id: ${id}) {
                        id
                        name
                    }
                }
            `;
        const queryP = graphql<{ heroes: Hero[] }>(schema, query).then(
            (response) => response.errors ? Promise.reject(response.errors) : Promise.resolve(response.data.heroes[0]));

        return from(queryP).pipe(
            tap(_ => this.log(`fetched hero id=${id}`)),
            catchError(this.handleError<Hero>(`getHero id=${id}`))
        );
    }

    /* GET heroes whose name contains search term */
    searchHeroes(term: string): Observable<Hero[]> {
        if (!term.trim()) {
            // if not search term, return empty hero array.
            return of([]);
        }
        return this.http.get<Hero[]>(`${this.heroesUrl}/?name=${term}`).pipe(
            tap(_ => this.log(`found heroes matching "${term}"`)),
            catchError(this.handleError<Hero[]>('searchHeroes', []))
        );
    }

    //////// Save methods //////////

    /** POST: add a new hero to the server */
    addHero(hero: Hero): Observable<Hero> {
        return this.http.post<Hero>(this.heroesUrl, hero, httpOptions).pipe(
            tap((newHero: Hero) => this.log(`added hero w/ id=${newHero.id}`)),
            catchError(this.handleError<Hero>('addHero'))
        );
    }

    /** DELETE: delete the hero from the server */
    deleteHero(hero: Hero | number): Observable<Hero> {
        const id = typeof hero === 'number' ? hero : hero.id;
        const url = `${this.heroesUrl}/${id}`;

        return this.http.delete<Hero>(url, httpOptions).pipe(
            tap(_ => this.log(`deleted hero id=${id}`)),
            catchError(this.handleError<Hero>('deleteHero'))
        );
    }

    /** PUT: update the hero on the server */
    updateHero(hero: Hero): Observable<any> {
        return this.http.put(this.heroesUrl, hero, httpOptions).pipe(
            tap(_ => this.log(`updated hero id=${hero.id}`)),
            catchError(this.handleError<any>('updateHero'))
        );
    }

    /**
     * Handle Http operation that failed.
     * Let the app continue.
     * @param operation - name of the operation that failed
     * @param result - optional value to return as the observable result
     */
    private handleError<T>(operation = 'operation', result?: T) {
        return (error: any): Observable<T> => {

            // TODO: send the error to remote logging infrastructure
            console.error(error); // log to console instead

            // TODO: better job of transforming error for user consumption
            this.log(`${operation} failed: ${error.message}`);

            // Let the app keep running by returning an empty result.
            return of(result as T);
        };
    }

    /** Log a HeroService message with the MessageService */
    private log(message: string) {
        this.messageService.add(`HeroService: ${message}`);
    }
}