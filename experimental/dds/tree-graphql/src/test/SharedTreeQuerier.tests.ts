/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, EditNode, initialTree, NodeId, SharedTree } from '@fluid-experimental/tree';
import SharedTreeQuerier from '../SharedTreeQuerier';
import { createTestQueryTree, encodeScalar, NodeIdGenerator } from './TestUtilities';
import { assert } from '@fluidframework/common-utils';
import { expect } from 'chai';
import { Drink, PizzaBase } from '../graphql-generated/Pizza';

describe('SharedTreeQuerier', () => {
	let id = new NodeIdGenerator();

	beforeEach(() => {
		id = new NodeIdGenerator();
	});

	function stringNode(value: string): EditNode {
		return {
			definition: 'String' as Definition,
			identifier: id.new(),
			traits: {},
			payload: encodeScalar(value),
		};
	}

	function booleanNode(value: boolean): EditNode {
		return {
			definition: 'Boolean' as Definition,
			identifier: id.new(),
			traits: {},
			payload: encodeScalar(value),
		};
	}

	function intNode(value: number): EditNode {
		assert(value === Math.round(value), 'Not an int');
		return {
			definition: 'Int' as Definition,
			identifier: id.new(),
			traits: {},
			payload: encodeScalar(value),
		};
	}

	function floatNode(value: number): EditNode {
		return {
			definition: 'Float' as Definition,
			identifier: id.new(),
			traits: {},
			payload: encodeScalar(value),
		};
	}

	function idNode(value: string): EditNode {
		return stringNode(value);
	}

	function enumNode(type: string, value: string): EditNode {
		return {
			definition: type as Definition,
			identifier: id.new(),
			traits: {},
			payload: encodeScalar(value),
		};
	}

	const fourPizzasTree: EditNode = {
		definition: 'Query' as Definition,
		identifier: id.new(),
		traits: {
			version: [idNode('0.0.1')],
			drinks: [enumNode('Drink', Drink.Water), enumNode('Drink', Drink.Coke), enumNode('Drink', Drink.Lemonade)],
			pizzas: [
				{
					// Cheese Pizza
					definition: 'Pizza' as Definition,
					identifier: 'Cheese Pizza' as NodeId,
					traits: {
						name: [stringNode('Cheese')],
						price: [floatNode(8.99)],
						base: [enumNode('PizzaBase', PizzaBase.Marinara)],
						hasCheese: [booleanNode(true)],
						slices: [intNode(6)],
					},
				},
				{
					// Pepperoni Pizza
					definition: 'Pizza' as Definition,
					identifier: 'Pepperoni Pizza' as NodeId,
					traits: {
						name: [stringNode('Pepperoni')],
						price: [floatNode(9.99)],
						base: [enumNode('PizzaBase', PizzaBase.Marinara)],
						hasCheese: [booleanNode(true)],
						toppings: [
							{
								definition: 'Topping' as Definition,
								identifier: id.new(),
								traits: {
									name: [stringNode('Pepperoni')],
									isVegetarian: [booleanNode(false)],
								},
							},
						],
						slices: [intNode(8)],
					},
				},
				{
					// Hawaiian Pizza
					definition: 'Pizza' as Definition,
					identifier: 'Hawaiian Pizza' as NodeId,
					traits: {
						name: [stringNode('Hawaiian')],
						price: [floatNode(11.5)],
						base: [enumNode('PizzaBase', PizzaBase.Marinara)],
						hasCheese: [booleanNode(true)],
						toppings: [
							{
								definition: 'Topping' as Definition,
								identifier: id.new(),
								traits: {
									name: [stringNode('Ham')],
									isVegetarian: [booleanNode(false)],
								},
							},
							{
								definition: 'Topping' as Definition,
								identifier: id.new(),
								traits: {
									name: [stringNode('Pineapple')],
									isVegetarian: [booleanNode(true)],
								},
							},
						],
						slices: [intNode(8)],
					},
				},
				{
					// Green Pizza
					definition: 'Pizza' as Definition,
					identifier: 'Green Pizza' as NodeId,
					traits: {
						name: [stringNode('Green')],
						price: [floatNode(9.99)],
						base: [enumNode('PizzaBase', PizzaBase.Pesto)],
						hasCheese: [booleanNode(false)],
						toppings: [
							{
								definition: 'Topping' as Definition,
								identifier: id.new(),
								traits: {
									name: [stringNode('Arugula')],
									isVegetarian: [booleanNode(true)],
								},
							},
							{
								definition: 'Topping' as Definition,
								identifier: id.new(),
								traits: {
									name: [stringNode('Bell Pepper')],
									isVegetarian: [booleanNode(true)],
								},
							},
						],
						slices: [intNode(4)],
					},
				},
			],
		},
	};

	function init(editTree): { tree: SharedTree; querier: SharedTreeQuerier } {
		const tree = createTestQueryTree(editTree);
		const querier = new SharedTreeQuerier(tree);
		return {
			tree,
			querier,
		};
	}

	it('can query a field', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				name
			}
		}`);

		expect(result!.pizzas!.length).equals(4);
	});

	it('can query nested fields', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				toppings {
					name
				}
			}
		}`);

		expect(result!.pizzas![0].toppings?.length).equals(0);
		expect(result!.pizzas![1].toppings?.length).equals(1);
		expect(result!.pizzas![2].toppings?.length).equals(2);
		expect(result!.pizzas![3].toppings?.length).equals(2);
	});

	it('can query strings', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				name
			}
		}`);

		expect(result!.pizzas![0].name).equals('Cheese');
		expect(result!.pizzas![1].name).equals('Pepperoni');
		expect(result!.pizzas![2].name).equals('Hawaiian');
		expect(result!.pizzas![3].name).equals('Green');
	});

	it('can query floats', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				price
			}
		}`);

		expect(result!.pizzas![0].price).is.closeTo(8.99, 0.01);
		expect(result!.pizzas![1].price).is.closeTo(9.99, 0.01);
		expect(result!.pizzas![2].price).is.closeTo(11.5, 0.01);
		expect(result!.pizzas![3].price).is.closeTo(9.99, 0.01);
	});

	it('can query integers', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				slices
			}
		}`);

		expect(result!.pizzas![0].slices).to.equal(6);
		expect(result!.pizzas![1].slices).to.equal(8);
		expect(result!.pizzas![2].slices).to.equal(8);
		expect(result!.pizzas![3].slices).to.equal(4);
	});

	it('can query booleans', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				hasCheese
			}
		}`);

		expect(result!.pizzas![0].hasCheese).to.be.true;
		expect(result!.pizzas![1].hasCheese).to.be.true;
		expect(result!.pizzas![2].hasCheese).to.be.true;
		expect(result!.pizzas![3].hasCheese).to.be.false;
	});

	it('can query IDs', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			version
		}`);

		expect(result!.version).to.equal('0.0.1');
	});

	it('can query enums', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				base
			}
		}`);

		expect(result!.pizzas![0].base).equals(PizzaBase.Marinara);
		expect(result!.pizzas![1].base).equals(PizzaBase.Marinara);
		expect(result!.pizzas![2].base).equals(PizzaBase.Marinara);
		expect(result!.pizzas![3].base).equals(PizzaBase.Pesto);
	});

	it('can query empty lists', async () => {
		const { querier } = init({
			definition: 'Query' as Definition,
			identifier: id.new(),
			traits: {
				/* No drinks */
			},
		});

		const result = await querier.query(`{
			drinks
		}`);

		expect(result!.drinks!.length).to.equal(0);
	});

	it('can query lists', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			drinks
		}`);

		expect(result!.drinks!.length).to.equal(3);
		expect(result!.drinks![0]).to.equal(Drink.Water);
		expect(result!.drinks![1]).to.equal(Drink.Coke);
		expect(result!.drinks![2]).to.equal(Drink.Lemonade);
	});

	it('can query the special identifier field', async () => {
		const { querier } = init(fourPizzasTree);
		const result = await querier.query(`{
			pizzas {
				id
			}
		}`);

		expect(result!.pizzas![0].id).to.equal('Cheese Pizza');
		expect(result!.pizzas![1].id).to.equal('Pepperoni Pizza');
		expect(result!.pizzas![2].id).to.equal('Hawaiian Pizza');
		expect(result!.pizzas![3].id).to.equal('Green Pizza');
	});

	it('reports missing optional values as null', async () => {
		const { querier } = init({
			definition: 'Query' as Definition,
			identifier: id.new(),
			traits: {
				/* No Version */
			},
		});

		const result = await querier.query(`{
			version
		}`);

		expect(result!.version).to.be.null;
	});
});
