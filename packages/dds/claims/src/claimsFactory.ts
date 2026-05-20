/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { SharedClaims as SharedClaimsClass } from "./claims.js";
import type { ISharedClaims } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link SharedClaims}.
 *
 * @sealed
 */
export class SharedClaimsFactory implements IChannelFactory<ISharedClaims> {
	/**
	 * Static value for {@link SharedClaimsFactory."type"}.
	 */
	public static readonly Type = "https://graph.microsoft.com/types/claims";

	/**
	 * Static value for {@link SharedClaimsFactory.attributes}.
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: SharedClaimsFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return SharedClaimsFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
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
		const claims = new SharedClaimsClass(id, runtime, attributes);
		await claims.load(services);
		return claims;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedClaims {
		const claims = new SharedClaimsClass(id, runtime, this.attributes);
		claims.initializeLocal();
		return claims;
	}
}

/**
 * Entrypoint for {@link ISharedClaims} creation.
 * @internal
 */
export const SharedClaims = createSharedObjectKind<ISharedClaims>(SharedClaimsFactory);

/**
 * Alias for {@link ISharedClaims} for compatibility.
 * @internal
 */
export type SharedClaims = ISharedClaims;
