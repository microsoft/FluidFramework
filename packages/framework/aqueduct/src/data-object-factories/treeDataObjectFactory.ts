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
	TreeDataObjectConstructorProps,
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
	TDataObjectTypes extends DataObjectTypes = DataObjectTypes,
> extends PureDataObjectFactory<TDataObject, TDataObjectTypes> {
	public constructor(props: DataObjectFactoryProps<TDataObject, TDataObjectTypes>) {
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

		const interceptedConstructor = function (
			_props: IDataObjectProps<TDataObjectTypes>,
		): TDataObject {
			const _newProps: IDataObjectProps<TDataObjectTypes> & TreeDataObjectConstructorProps = {
				..._props,
				treeFactory,
			}
			return new baseCtor(_newProps);
		} as unknown as typeof baseCtor;

		newProps.ctor = interceptedConstructor;

		super(newProps);
	}
}
