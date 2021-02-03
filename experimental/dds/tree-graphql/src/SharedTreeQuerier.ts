/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { initialTree, SharedTree } from '@fluid-experimental/tree';
import { graphql, GraphQLSchema } from 'graphql';
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
		return (await graphql<TQuery>(this.schema, query, initialTree.identifier, this.tree)).data ?? null;
	}
}
