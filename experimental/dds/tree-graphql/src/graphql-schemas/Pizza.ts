/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const typeDefs = /* GraphQL */ `
	type Query {
		pizzas: [Pizza!]
		drinks: [Drink!]
		version: ID
	}

	type Pizza {
		id: ID!
		name: String!
		price: Float!
		base: PizzaBase
		hasCheese: Boolean
		toppings: [Topping!]
		slices: Int
	}

	type Topping {
		name: String!
		isVegetarian: Boolean!
	}

	enum PizzaBase {
		MARINARA
		GARLIC
		PESTO
	}

	enum Drink {
		WATER
		COKE
		LEMONADE
	}
`;
