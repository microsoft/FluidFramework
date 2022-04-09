/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, ChangeNode, SharedTree, NodeIdContext } from '@fluid-experimental/tree';
import { assert } from '@fluidframework/common-utils';
import { expect } from 'chai';
import { Maybe } from 'graphql-tools';
import { SharedTreeQuerier } from '../SharedTreeQuerier';
import { typeDefs } from '../graphql-schemas/Pizza';
import { Drink, Pizza, PizzaBase, Query, resolvers } from '../graphql-generated/Pizza';
import { createTestQueryTree } from './TestUtilities';

describe('SharedTreeQuerier', () => {
	function stringNode(idContext: NodeIdContext, value: string): ChangeNode {
		return {
			definition: 'String' as Definition,
			identifier: idContext.generateNodeId(),
			traits: {},
			payload: value,
		};
	}

	function booleanNode(idContext: NodeIdContext, value: boolean): ChangeNode {
		return {
			definition: 'Boolean' as Definition,
			identifier: idContext.generateNodeId(),
			traits: {},
			payload: value,
		};
	}

	function intNode(idContext: NodeIdContext, value: number): ChangeNode {
		assert(value === Math.round(value), 'Not an int');
		return {
			definition: 'Int' as Definition,
			identifier: idContext.generateNodeId(),
			traits: {},
			payload: value,
		};
	}

	function floatNode(idContext: NodeIdContext, value: number): ChangeNode {
		return {
			definition: 'Float' as Definition,
			identifier: idContext.generateNodeId(),
			traits: {},
			payload: value,
		};
	}

	function idNode(idContext: NodeIdContext, value: string): ChangeNode {
		return stringNode(idContext, value);
	}

	function enumNode(idContext: NodeIdContext, type: string, value: string): ChangeNode {
		return {
			definition: type as Definition,
			identifier: idContext.generateNodeId(),
			traits: {},
			payload: value,
		};
	}

	const fourPizzasTreeFactory = (idContext: NodeIdContext): ChangeNode => ({
		definition: 'Query' as Definition,
		identifier: idContext.generateNodeId(),
		traits: {
			version: [idNode(idContext, '0.0.1')],
			drinks: [
				enumNode(idContext, 'Drink', Drink.Water),
				enumNode(idContext, 'Drink', Drink.Coke),
				enumNode(idContext, 'Drink', Drink.Lemonade),
			],
			pizzas: [
				{
					definition: 'Pizza' as Definition,
					identifier: idContext.generateNodeId('Cheese Pizza'),
					traits: {
						name: [stringNode(idContext, 'Cheese')],
						price: [floatNode(idContext, 8.99)],
						base: [enumNode(idContext, 'PizzaBase', PizzaBase.Marinara)],
						hasCheese: [booleanNode(idContext, true)],
						slices: [intNode(idContext, 6)],
					},
				},
				{
					definition: 'Pizza' as Definition,
					identifier: idContext.generateNodeId('Pepperoni Pizza'),
					traits: {
						name: [stringNode(idContext, 'Pepperoni')],
						price: [floatNode(idContext, 9.99)],
						base: [enumNode(idContext, 'PizzaBase', PizzaBase.Marinara)],
						hasCheese: [booleanNode(idContext, true)],
						toppings: [
							{
								definition: 'Topping' as Definition,
								identifier: idContext.generateNodeId(),
								traits: {
									name: [stringNode(idContext, 'Pepperoni')],
									isVegetarian: [booleanNode(idContext, false)],
								},
							},
						],
						slices: [intNode(idContext, 8)],
					},
				},
				{
					definition: 'Pizza' as Definition,
					identifier: idContext.generateNodeId('Hawaiian Pizza'),
					traits: {
						name: [stringNode(idContext, 'Hawaiian')],
						price: [floatNode(idContext, 11.5)],
						base: [enumNode(idContext, 'PizzaBase', PizzaBase.Marinara)],
						hasCheese: [booleanNode(idContext, true)],
						toppings: [
							{
								definition: 'Topping' as Definition,
								identifier: idContext.generateNodeId(),
								traits: {
									name: [stringNode(idContext, 'Ham')],
									isVegetarian: [booleanNode(idContext, false)],
								},
							},
							{
								definition: 'Topping' as Definition,
								identifier: idContext.generateNodeId(),
								traits: {
									name: [stringNode(idContext, 'Pineapple')],
									isVegetarian: [booleanNode(idContext, true)],
								},
							},
						],
						slices: [intNode(idContext, 8)],
					},
				},
				{
					definition: 'Pizza' as Definition,
					identifier: idContext.generateNodeId('Green Pizza'),
					traits: {
						name: [stringNode(idContext, 'Green')],
						price: [floatNode(idContext, 9.99)],
						base: [enumNode(idContext, 'PizzaBase', PizzaBase.Pesto)],
						hasCheese: [booleanNode(idContext, false)],
						toppings: [
							{
								definition: 'Topping' as Definition,
								identifier: idContext.generateNodeId(),
								traits: {
									name: [stringNode(idContext, 'Arugula')],
									isVegetarian: [booleanNode(idContext, true)],
								},
							},
							{
								definition: 'Topping' as Definition,
								identifier: idContext.generateNodeId(),
								traits: {
									name: [stringNode(idContext, 'Bell Pepper')],
									isVegetarian: [booleanNode(idContext, true)],
								},
							},
						],
						slices: [intNode(idContext, 4)],
					},
				},
			],
		},
	});

	function init(editTree): { tree: SharedTree; querier: SharedTreeQuerier<Query> } {
		const tree = createTestQueryTree(editTree);
		const querier = new SharedTreeQuerier<Query>(typeDefs, resolvers, tree);
		return {
			tree,
			querier,
		};
	}

	function getPizzas(query: Maybe<Query>): Pizza[] {
		assert(query !== null && query !== undefined, 'Query returned null unexpectedly');
		assert(query.pizzas !== null && query.pizzas !== undefined, 'Query returned no pizzas');
		return query.pizzas;
	}

	function getDrinks(query: Maybe<Query>): Drink[] {
		assert(query !== null && query !== undefined, 'Query returned null unexpectedly');
		assert(query.drinks !== null && query.drinks !== undefined, 'Query returned no pizzas');
		return query.drinks;
	}

	it('can query a field', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				name
			}
		}`);

		expect(result?.pizzas?.length).equals(4);
	});

	it('can query nested fields', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				toppings {
					name
				}
			}
		}`);

		expect(getPizzas(result)[0].toppings?.length).equals(0);
		expect(getPizzas(result)[1].toppings?.length).equals(1);
		expect(getPizzas(result)[2].toppings?.length).equals(2);
		expect(getPizzas(result)[3].toppings?.length).equals(2);
	});

	it('can query strings', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				name
			}
		}`);

		expect(getPizzas(result)[0].name).equals('Cheese');
		expect(getPizzas(result)[1].name).equals('Pepperoni');
		expect(getPizzas(result)[2].name).equals('Hawaiian');
		expect(getPizzas(result)[3].name).equals('Green');
	});

	it('can query floats', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				price
			}
		}`);

		expect(getPizzas(result)[0].price).is.closeTo(8.99, 0.01);
		expect(getPizzas(result)[1].price).is.closeTo(9.99, 0.01);
		expect(getPizzas(result)[2].price).is.closeTo(11.5, 0.01);
		expect(getPizzas(result)[3].price).is.closeTo(9.99, 0.01);
	});

	it('can query integers', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				slices
			}
		}`);

		expect(getPizzas(result)[0].slices).to.equal(6);
		expect(getPizzas(result)[1].slices).to.equal(8);
		expect(getPizzas(result)[2].slices).to.equal(8);
		expect(getPizzas(result)[3].slices).to.equal(4);
	});

	it('can query booleans', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				hasCheese
			}
		}`);

		expect(getPizzas(result)[0].hasCheese).to.be.true;
		expect(getPizzas(result)[1].hasCheese).to.be.true;
		expect(getPizzas(result)[2].hasCheese).to.be.true;
		expect(getPizzas(result)[3].hasCheese).to.be.false;
	});

	it('can query IDs', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			version
		}`);

		expect(result?.version).to.equal('0.0.1');
	});

	it('can query enums', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				base
			}
		}`);

		expect(getPizzas(result)[0].base).equals(PizzaBase.Marinara);
		expect(getPizzas(result)[1].base).equals(PizzaBase.Marinara);
		expect(getPizzas(result)[2].base).equals(PizzaBase.Marinara);
		expect(getPizzas(result)[3].base).equals(PizzaBase.Pesto);
	});

	it('can query empty lists', async () => {
		const { querier } = init((idContext: NodeIdContext) => ({
			definition: 'Query' as Definition,
			identifier: idContext.generateNodeId(),
			traits: {
				/* No drinks */
			},
		}));

		const result = await querier.query(`{
			drinks
		}`);

		expect(getDrinks(result).length).to.equal(0);
	});

	it('can query lists', async () => {
		const { querier } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			drinks
		}`);

		expect(getDrinks(result).length).to.equal(3);
		expect(getDrinks(result)[0]).to.equal(Drink.Water);
		expect(getDrinks(result)[1]).to.equal(Drink.Coke);
		expect(getDrinks(result)[2]).to.equal(Drink.Lemonade);
	});

	it('can query the special identifier field', async () => {
		const { querier, tree } = init(fourPizzasTreeFactory);
		const result = await querier.query(`{
			pizzas {
				id
			}
		}`);

		expect(getPizzas(result)[0].id).to.equal('Cheese Pizza');
		expect(getPizzas(result)[1].id).to.equal('Pepperoni Pizza');
		expect(getPizzas(result)[2].id).to.equal('Hawaiian Pizza');
		expect(getPizzas(result)[3].id).to.equal('Green Pizza');
	});

	it('reports missing optional values as null', async () => {
		const { querier } = init((idContext: NodeIdContext) => ({
			definition: 'Query' as Definition,
			identifier: idContext.generateNodeId(),
			traits: {
				/* No Version */
			},
		}));

		const result = await querier.query(`{
			version
		}`);

		expect(result?.version).to.be.null;
	});
});
