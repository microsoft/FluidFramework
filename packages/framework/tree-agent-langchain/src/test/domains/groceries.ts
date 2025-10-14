/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.groceries");

export class Grocery extends sf.objectRecursive(
	"Grocery",
	{
		name: sf.required(sf.string, {
			metadata: {
				description: "The name of the grocery item as it should appear on the list.",
			},
		}),
		price: sf.required(sf.number, {
			metadata: {
				description: "The unit price for the item in US dollars.",
			},
		}),
		purchased: sf.required(sf.boolean, {
			metadata: {
				description: "Whether the customer has already purchased the item.",
			},
		}),
		nextGrocery: sf.optionalRecursive([() => Grocery], {
			metadata: {
				description: "The next grocery item to purchase after this one, if any.",
			},
		}),
	},
	{
		metadata: {
			description:
				"An entry on a grocery list containing the item's name, price, and purchase status.",
		},
	},
) {}

export class GroceryList extends sf.array("Groceries", Grocery) {}
