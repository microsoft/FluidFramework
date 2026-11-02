/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/legacy";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base/legacy";

import {
	ConsensusRegisterCollection,
	ConsensusRegisterCollectionFactory,
	type IConsensusRegisterCollection,
} from "@fluidframework/register-collection/legacy";

// @ts-expect-error The implementation class is not a supported export.
export type { ConsensusRegisterCollectionClass } from "@fluidframework/register-collection/legacy";

declare function use(value: unknown): void;

/**
 * Checks the supported creation APIs and the interface alias.
 */
export function checkCreation(runtime: IFluidDataStoreRuntime): void {
	const kind: ISharedObjectKind<IConsensusRegisterCollection> = ConsensusRegisterCollection;
	const fromKind: IConsensusRegisterCollection = kind.create(runtime);
	const alias: ConsensusRegisterCollection<string> =
		new ConsensusRegisterCollectionFactory().create(runtime, "register");
	const fromAlias: IConsensusRegisterCollection<string> = alias;
	const factory: ConsensusRegisterCollectionFactory = ConsensusRegisterCollection.getFactory();
	use([fromKind, fromAlias, factory]);
}
