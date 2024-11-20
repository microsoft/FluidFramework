/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientSessionId, ISessionClient } from "./presence.js";

import type { IRuntimeInternal } from "@fluidframework/presence/internal/container-definitions/internal";

/**
 * @internal
 */
export interface ClientRecord<TValue extends InternalTypes.ValueDirectoryOrState<unknown>> {
	// Caution: any particular item may or may not exist
	// Typescript does not support absent keys without forcing type to also be undefined.
	// See https://github.com/microsoft/TypeScript/issues/42810.
	[ClientSessionId: ClientSessionId]: TValue;
}

/**
 * Object.entries retyped to support branded string-based keys.
 *
 * @internal
 */
export const brandedObjectEntries = Object.entries as <K extends string, T>(
	o: Record<K, T>,
) => [K, T][];

/**
 * This interface is a subset of (IContainerRuntime & IRuntimeInternal) and
 * (IFluidDataStoreRuntime) that is needed by the Presence States.
 *
 * @privateRemarks
 * Replace with non-DataStore based interface.
 *
 * @internal
 */
export type IEphemeralRuntime = Pick<
	(IContainerRuntime & IRuntimeInternal) | IFluidDataStoreRuntime,
	"clientId" | "connected" | "getAudience" | "getQuorum" | "off" | "on" | "submitSignal"
> &
	Partial<Pick<IFluidDataStoreRuntime, "logger">>;

/**
 * @internal
 */
export interface ValueManager<
	TValue,
	TValueState extends
		InternalTypes.ValueDirectoryOrState<TValue> = InternalTypes.ValueDirectoryOrState<TValue>,
> {
	// Most value managers should provide value - implement Required<ValueManager<...>>
	readonly value?: TValueState;
	update(client: ISessionClient, received: number, value: TValueState): void;
}
