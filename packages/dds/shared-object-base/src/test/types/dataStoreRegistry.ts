/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DataStoreKind,
	ServiceClient,
} from "@fluidframework/driver-definitions/internal";

import { dataStoreRegistryFromIterable } from "../../dataStoreKind.js";

interface Root {
	value: string;
}

/**
 * Compile-time checks only; this function is not executed.
 */
export async function checkRegistryOutputTypes(
	client: ServiceClient,
	rootKind: DataStoreKind<Root>,
	numberKind: DataStoreKind<number>,
): Promise<readonly [Root, Root, Root | number]> {
	const eager = dataStoreRegistryFromIterable([rootKind]);
	const lazy = dataStoreRegistryFromIterable([
		{ type: rootKind.type, kind: async () => rootKind },
	]);
	const inferred = await client.loadContainer("document", eager);
	const inferredLazy = await client.loadContainer("document", lazy);
	await client.loadContainer<Root>("document", eager);
	await client.loadContainer<Root>("document", lazy);

	const mixed = dataStoreRegistryFromIterable<Root | number>([
		rootKind,
		{ type: numberKind.type, kind: async () => numberKind },
	]);
	const mixedContainer = await client.loadContainer("document", mixed);

	// @ts-expect-error A number-producing kind cannot satisfy a Root-only registry.
	dataStoreRegistryFromIterable<Root>([numberKind]);

	return [inferred.data, inferredLazy.data, mixedContainer.data];
}
