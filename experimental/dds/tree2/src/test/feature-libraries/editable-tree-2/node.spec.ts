/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	DocumentSchema,
	ProxyField,
	ProxyRoot,
	SharedTreeNode,
	node,
} from "../../../feature-libraries";

import { itWithRoot, makeSchema } from "./utils";

describe("node() API", () => {
	describe("events", () => {
		function check<TSchema extends DocumentSchema<any>>(
			schema: TSchema,
			initialTree: ProxyRoot<TSchema, "javaScript">,
			mutate: (root: ProxyField<(typeof schema)["rootFieldSchema"]>) => void,
		) {
			itWithRoot(".on(..) must subscribe to change event", schema, initialTree, (root) => {
				const log: any[][] = [];

				const api = node(root as SharedTreeNode);

				api.on("subtreeChanging", (...args: any[]) => {
					log.push(args);
				});

				mutate(root);

				const numChanges = log.length;
				assert(
					numChanges > 0,
					"Must receive change notifications after subscribing to event.",
				);
			});

			itWithRoot(".on(..) must return unsubscribe function", schema, initialTree, (root) => {
				const log: any[][] = [];

				const api = node(root as SharedTreeNode);

				const unsubscribe = api.on("subtreeChanging", (...args: any[]) => {
					log.push(args);
				});

				mutate(root);

				const numChanges = log.length;
				assert(
					numChanges > 0,
					"Must receive change notifications after subscribing to event.",
				);

				unsubscribe();

				mutate(root);

				assert.equal(
					log.length,
					numChanges,
					"Mutation after unsubscribe must not emit change events.",
				);
			});
		}

		describe("object", () => {
			check(
				makeSchema((_) =>
					_.struct("", {
						content: _.boolean,
					}),
				),
				{ content: false },
				($) => ($.content = !$.content),
			);
		});

		describe("list", () => {
			check(
				makeSchema((_) => _.fieldNode("", _.sequence(_.number))),
				[],
				($) => $.insertAtEnd([$.length]),
			);
		});

		// TODO: map
	});
});
