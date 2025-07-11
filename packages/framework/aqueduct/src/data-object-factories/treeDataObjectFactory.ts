/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree } from "@fluidframework/tree/internal";

import type { DataObjectTypes, TreeDataObject } from "../data-objects/index.js";

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
		const newProps = {
			...props,
			sharedObjects: props.sharedObjects ? [...props.sharedObjects] : [],
		};

		// If the user did not specify a SharedTree factory, add it to the shared objects.
		if (
			!newProps.sharedObjects.some(
				(sharedObject) => sharedObject.type === SharedTree.getFactory().type,
			)
		) {
			newProps.sharedObjects.push(SharedTree.getFactory());
		}

		super(newProps);
	}
}
