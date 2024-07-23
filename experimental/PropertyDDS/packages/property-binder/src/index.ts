/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataBinder } from "./data_binder/dataBinder.js";

import {
	DataBinding,
	onPathChanged,
	onPropertyChanged,
	onValuesChanged,
} from "./data_binder/dataBinding.js";
import { forEachProperty } from "./data_binder/internalUtils.js";
import { RemovalContext } from "./data_binder/removalContext.js";
import {
	SingletonDataBinding,
	StatelessDataBinding,
} from "./data_binder/statelessDataBinding.js";
import { DataBinderHandle } from "./internal/dataBinderHandle.js";
import { PropertyElement } from "./internal/propertyElement.js";
import { UpgradeType } from "./internal/semvermap.js";

import { IActivateDataBindingOptions } from "./data_binder/IActivateDataBindingOptions.js";
import {
	IDefineRepresentationOptions,
	representationDestroyer,
	representationGenerator,
	representationInitializer,
} from "./data_binder/IDefineRepresentationOptions.js";
import { IRegisterOnPathOptions } from "./data_binder/IRegisterOnPathOptions.js";

export {
	DataBinder,
	DataBinderHandle,
	DataBinding,
	IActivateDataBindingOptions,
	IDefineRepresentationOptions,
	IRegisterOnPathOptions,
	SingletonDataBinding,
	StatelessDataBinding,
	onValuesChanged,
	onPathChanged,
	onPropertyChanged,
	PropertyElement,
	representationDestroyer,
	representationGenerator,
	representationInitializer,
	RemovalContext,
	forEachProperty,
	UpgradeType,
};
