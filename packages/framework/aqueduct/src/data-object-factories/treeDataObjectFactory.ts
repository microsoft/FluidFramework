/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DataObjectTypes,
	IDataObjectProps,
	ModelDescriptor,
	TreeDataObject,
} from "../data-objects/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { RootTreeView } from "../data-objects/treeDataObject.js"; //* TODO: Properly export

import { MigrationDataObjectFactory } from "./migrationDataObjectFactory.js";
import type { DataObjectFactoryProps } from "./pureDataObjectFactory.js";

/**
 * {@link @fluidframework/runtime-definitions#IFluidDataStoreFactory} for use with {@link TreeDataObject}s.
 *
 * @typeParam TDataObject - The concrete TreeDataObject implementation.
 * @typeParam TDataObjectTypes - The input types for the DataObject
 *
 * @legacy @beta
 */
export class TreeDataObjectFactory<
	TDataObject extends TreeDataObject<TDataObjectTypes>,
	TDataObjectTypes extends DataObjectTypes = DataObjectTypes,
> extends MigrationDataObjectFactory<
	TDataObject,
	RootTreeView,
	TDataObjectTypes
> {
	public constructor(props: DataObjectFactoryProps<TDataObject, TDataObjectTypes>) {
		super({
			...props,
			// This cast is safe because TObj extends DataObject, which has static modelDescriptors
			ctor: props.ctor as (new (
				doProps: IDataObjectProps<TDataObjectTypes>,
			) => TDataObject) & {
				modelDescriptors: readonly [
					ModelDescriptor<RootTreeView>,
					...ModelDescriptor<RootTreeView>[],
				];
			}, //* TODO: Can we do something to avoid needing this cast?
			asyncGetDataForMigration: async () => {
				throw new Error("No migration supported");
			},
			canPerformMigration: async () => false,
			migrateDataObject: () => {
				throw new Error("No migration supported");
			},
		});
	}
}
