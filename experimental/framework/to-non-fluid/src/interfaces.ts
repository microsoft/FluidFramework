/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel } from "@fluidframework/datastore-definitions";
import { IFluidSerializer } from "@fluidframework/shared-object-base";

export interface ILocalChannel {
	id: string;
	type: string;
}

export interface ISerializableChannel extends IChannel {
	_serializer: IFluidSerializer;
}
