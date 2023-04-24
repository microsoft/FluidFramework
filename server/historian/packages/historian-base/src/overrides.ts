/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IStorageNameProvider } from "./services";

export interface IHistorianResourcesCustomizations {
	storageNameProvider?: IStorageNameProvider;
}
