/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannel,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import type { MigrationOptions, MigrationSet } from "../shim.js";
import { identityAdapter, migrate, shimInfo } from "../shim.js";

{
	const mySet = {
		from: SharedMap,
		selector(id: string): MigrationOptions<SharedMap, ITree, { x: 5 }> {
			return {
				migrationIdentifier: "x",
				to: SharedTree,
				beforeAdapter(from: SharedMap) {
					// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
					return { x: 5 } as { x: 5 } & IChannel;
				},
				afterAdapter(from: ITree) {
					// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
					return { x: 5 } as { x: 5 } & IChannel;
				},
				migrate(from: SharedMap, to: ITree) {
					// TODO: Implement
				},
			};
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} satisfies MigrationSet<any>;

	const foo = migrate(mySet);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
	const adapted = foo.create(undefined as any, "X");
}

{
	const migrationX: MigrationOptions<SharedMap, ITree, SharedMap | ITree> = {
		migrationIdentifier: "mapToTreeUnion",
		to: SharedTree,
		beforeAdapter(from: SharedMap) {
			return from;
		},
		afterAdapter(from: ITree) {
			return from as ITree & IChannel;
		},
		migrate(from: SharedMap, to: ITree) {
			// TODO: Implement
		},
	};

	const migrationNone: MigrationOptions<SharedMap, SharedMap, SharedMap> = {
		migrationIdentifier: "none",
		to: SharedMap,
		beforeAdapter: identityAdapter,
		afterAdapter: identityAdapter,
		migrate(from: ISharedMap, to: ISharedMap) {},
	};

	const mySet: MigrationSet<SharedMap> = {
		from: SharedMap,
		selector(id: string): MigrationOptions<SharedMap, unknown, unknown> {
			return id === "x" ? migrationX : migrationNone;
		},
	};

	const foo = migrate(mySet);

	const adapted = foo.create(undefined as unknown as IFluidDataStoreRuntime, "x");

	const casted = adapted[shimInfo].cast(migrationX);
}
