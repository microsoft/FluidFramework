/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { initialTree, SharedTree } from '@fluid-experimental/tree';
import { graphql, GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from 'graphql-tools';
import { Query, resolvers } from './graphql-generated/Pizza';
import typeDefs from './graphql-schemas/Pizza';

/**
 * Wraps a `SharedTree` and allows it to be easily queried for pizza.
 */
export default class SharedTreeQuerier {
	public readonly tree: SharedTree;
	private readonly schema: GraphQLSchema;

	/** SharedTree must have pizza inside */
	public constructor(tree: SharedTree) {
		this.tree = tree;
		this.schema = makeExecutableSchema({ typeDefs, resolvers });
	}

	public async query(query: string): Promise<Query> {
		return (await graphql(this.schema, query, initialTree.identifier, this.tree)).data;
	}
}
