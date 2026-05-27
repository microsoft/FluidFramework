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

import { Claims as ClaimsImpl } from "./claims.js";
import type { IClaims } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * Factory for creating Claims instances.
 *
 * @internal
 */
export class ClaimsFactory implements IChannelFactory<IClaims> {
	public static readonly Type = "https://graph.microsoft.com/types/claims";

	public static readonly Attributes: IChannelAttributes = {
		type: ClaimsFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return ClaimsFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return ClaimsFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IClaims> {
		const claims = new ClaimsImpl(id, runtime, attributes);
		await claims.load(services);
		return claims;
	}

	public create(document: IFluidDataStoreRuntime, id: string): IClaims {
		const claims = new ClaimsImpl(id, document, this.attributes);
		claims.initializeLocal();
		return claims;
	}
}

/**
 * A distributed data structure providing first-writer-wins claim semantics.
 *
 * @remarks
 * Claims acts as a scoped aliasing mechanism. Once a key is claimed, it cannot be
 * overwritten. The `trySetClaim` method returns a promise that resolves after the op
 * roundtrips, indicating whether the claim was accepted or if another client claimed it first.
 *
 * ### Creation
 *
 * ```typescript
 * const claims = Claims.create(this.runtime, id);
 * ```
 *
 * ### Usage
 *
 * ```typescript
 * const result = claims.trySetClaim("singleton-component", componentHandle);
 * if (result.status === "AlreadyClaimed") {
 *     // Another client already claimed it; use result.currentValue.
 * } else if (result.status === "Pending") {
 *     // Wait for the server to confirm the claim.
 *     const confirmation = await result.promise;
 *     if (confirmation.status === "Accepted") {
 *         // This client successfully claimed the key.
 *     } else if (confirmation.status === "AlreadyClaimed") {
 *         // Another client claimed it first; use confirmation.currentValue.
 *     }
 * }
 * ```
 *
 * @internal
 */
export const ClaimsKind = createSharedObjectKind(ClaimsFactory);
