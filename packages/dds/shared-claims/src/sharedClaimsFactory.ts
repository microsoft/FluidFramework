/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import type { ISharedClaims } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";
import { SharedClaims as SharedClaimsImpl } from "./sharedClaims.js";

/**
 * Factory for creating SharedClaims instances.
 *
 * @internal
 */
export class SharedClaimsFactory implements IChannelFactory<ISharedClaims> {
	public static readonly Type = "https://graph.microsoft.com/types/shared-claims";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedClaimsFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return SharedClaimsFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return SharedClaimsFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedClaims> {
		const sharedClaims = new SharedClaimsImpl(id, runtime, attributes);
		await sharedClaims.load(services);
		return sharedClaims;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ISharedClaims {
		const sharedClaims = new SharedClaimsImpl(id, document, this.attributes);
		sharedClaims.initializeLocal();
		return sharedClaims;
	}
}

/**
 * A distributed data structure providing first-writer-wins claim semantics.
 *
 * @remarks
 * SharedClaims acts as a scoped aliasing mechanism. Once a key is claimed, it cannot be
 * overwritten. The `trySetClaim` method returns a promise that resolves after the op
 * roundtrips, indicating whether the claim was accepted or if another client claimed it first.
 *
 * ### Creation
 *
 * ```typescript
 * const claims = SharedClaims.create(this.runtime, id);
 * ```
 *
 * ### Usage
 *
 * ```typescript
 * const result = await claims.trySetClaim("singleton-component", componentHandle);
 * if (result.status === "accepted") {
 *     // This client successfully claimed the key.
 * } else if (result.status === "alreadyClaimed") {
 *     // Another client already claimed it; use result.currentValue.
 * }
 * ```
 *
 * @internal
 */
export const SharedClaimsKind = createSharedObjectKind(SharedClaimsFactory);
