/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getString,
	getFloat,
	getInt,
	getBoolean,
	getID,
	getNodeID,
	getStringList,
	getListTrait,
} from '../graphql-plugins/SharedTreePlugin';

export type Maybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
	ID: string;
	String: string;
	Boolean: boolean;
	Int: number;
	Float: number;
};

export type Query = {
	__typename?: 'Query';
	pizzas?: Maybe<Array<Pizza>>;
	drinks?: Maybe<Array<Drink>>;
	version?: Maybe<Scalars['ID']>;
};

export type Pizza = {
	__typename?: 'Pizza';
	id: Scalars['ID'];
	name: Scalars['String'];
	price: Scalars['Float'];
	base?: Maybe<PizzaBase>;
	hasCheese?: Maybe<Scalars['Boolean']>;
	toppings?: Maybe<Array<Topping>>;
	slices?: Maybe<Scalars['Int']>;
};

export type Topping = {
	__typename?: 'Topping';
	name: Scalars['String'];
	isVegetarian: Scalars['Boolean'];
};

export enum PizzaBase {
	Marinara = 'MARINARA',
	Garlic = 'GARLIC',
	Pesto = 'PESTO',
}

export enum Drink {
	Water = 'WATER',
	Coke = 'COKE',
	Lemonade = 'LEMONADE',
}

export const resolvers = {
	Query: {
		pizzas: getListTrait,
		drinks: getStringList,
		version: getID,
	},
	Pizza: {
		id: getNodeID,
		name: getString,
		price: getFloat,
		base: getString,
		hasCheese: getBoolean,
		toppings: getListTrait,
		slices: getInt,
	},
	Topping: {
		name: getString,
		isVegetarian: getBoolean,
	},
};
