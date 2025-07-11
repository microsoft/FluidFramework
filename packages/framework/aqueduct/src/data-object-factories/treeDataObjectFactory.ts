/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import type {
	DataObjectTypes,
	IDataObjectProps,
	TreeDataObject,
	TreeDataObjectProps,
} from "../data-objects/index.js";

import {
	PureDataObjectFactory,
	type DataObjectFactoryProps,
} from "./pureDataObjectFactory.js";

/**
 * {@link @fluidframework/runtime-definitions#IFluidDataStoreFactory} for use with {@link TreeDataObject}s.
 *
 * @typeParam TDataObject - The concrete TreeDataObject implementation.
 * @typeParam TDataObjectTypes - The input types for the DataObject
 * @internal
 */
export class TreeDataObjectFactory<
	TDataObject extends TreeDataObject<TTreeView, TDataObjectTypes>,
	TTreeView,
	TDataObjectTypes extends
		DataObjectTypes<TreeDataObjectProps> = DataObjectTypes<TreeDataObjectProps>,
> extends PureDataObjectFactory<TDataObject, DataObjectTypes<TreeDataObjectProps>> {
	public constructor(props: DataObjectFactoryProps<TDataObject>) {
		const baseCtor = props.ctor;
		const newProps = {
			...props,
			sharedObjects: props.sharedObjects ? [...props.sharedObjects] : [],
		};

		const maybeTreeFactory = props.sharedObjects?.find(
			(sharedObject) => sharedObject.type === SharedTree.getFactory().type,
		);
		const treeFactory =
			(maybeTreeFactory as IChannelFactory<ITree>) ?? SharedTree.getFactory();
		if (maybeTreeFactory === undefined) {
			newProps.sharedObjects.push(treeFactory);
		}

		type Newable = new (
			_props: IDataObjectProps<DataObjectTypes<TreeDataObjectProps>>,
		) => TDataObject;

		const interceptedConstructor: Newable = function (
			_props: IDataObjectProps<DataObjectTypes<TreeDataObjectProps>>,
		): TDataObject {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			return new baseCtor({
				..._props,
				treeFactory,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);
		} as unknown as Newable;

		newProps.ctor = interceptedConstructor;

		super(newProps);
	}
}
