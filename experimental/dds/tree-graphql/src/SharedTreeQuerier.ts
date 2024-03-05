/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initialTree, SharedTree } from '@fluid-experimental/tree';
import { ExecutionResult, graphql, GraphQLSchema } from 'graphql';
import { IResolvers, ITypeDefinitions, makeExecutableSchema, Maybe } from 'graphql-tools';

/**
 * A small helper class to allow repeat queries to a given `SharedTree`
 */
export class SharedTreeQuerier<TQuery> {
	public readonly tree: SharedTree;
	private readonly schema: GraphQLSchema;

	public constructor(
		typeDefs: ITypeDefinitions,
		resolvers: IResolvers<any, SharedTree> | IResolvers<any, SharedTree>[],
		tree: SharedTree
	) {
		this.tree = tree;
		this.schema = makeExecutableSchema({ typeDefs, resolvers });
	}

	public async query(query: string): Promise<Maybe<TQuery>> {
		const result = (await graphql(
			this.schema,
			query,
			this.tree.convertToNodeId(initialTree.identifier),
			this.tree
		)) as ExecutionResult<TQuery>;

		return result.data;
	}
}
