/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IUser } from "@fluidframework/driver-definitions";
import type { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import type { ITokenProvider } from "@fluidframework/routerlicious-driver";

/**
 * Properties for initializing a {@link TinyliciousClient}.
 * @sealed
 * @public
 */
export interface TinyliciousClientProps {
	/**
	 * Optional. Configuration for establishing a connection with the Tinylicious.
	 * If not specified, will use {@link TinyliciousConnectionConfig}'s default values.
	 */
	readonly connection?: TinyliciousConnectionConfig;

	/**
	 * Optional. A logger instance to receive diagnostic messages.
	 */
	readonly logger?: ITelemetryBaseLogger;
}

/**
 * Parameters for establishing a connection with the a Tinylicious service.
 * @sealed
 * @public
 */
export interface TinyliciousConnectionConfig {
	/**
	 * Optional. Override of the port.
	 *
	 * @defaultValue {@link @fluidframework/tinylicious-driver#defaultTinyliciousPort}
	 */
	readonly port?: number;

	/**
	 * Optional. Override of the domain.
	 *
	 * @defaultValue {@link @fluidframework/tinylicious-driver#defaultTinyliciousEndpoint}
	 */
	readonly domain?: string;

	/**
	 * Optional. Override of tokenProvider. If a param is not provided, TinyliciousConnectionConfig
	 * will use the default tokenProvider which is InsecureTinyliciousTokenProvider with default scopes,
	 * which are document read, write and summarizer write.
	 *
	 * @defaultValue {@link @fluidframework/tinylicious-driver#InsecureTinyliciousTokenProvider}
	 */
	readonly tokenProvider?: ITokenProvider;
}

/**
 * Holds the functionality specifically tied to the Tinylicious service, and how the data stored in
 * the {@link @fluidframework/fluid-static#IFluidContainer} is persisted in the backend and consumed by users.
 *
 * @remarks
 * Any functionality regarding how the data is handled within the FluidContainer itself (e.g., which data objects or
 * DDSes to use) will not be included here but rather on the FluidContainer class itself.
 *
 * Returned by {@link TinyliciousClient.createContainer} and {@link TinyliciousClient.getContainer} alongside the FluidContainer.
 *
 * @sealed
 * @public
 */
export interface TinyliciousContainerServices {
	/**
	 * Provides an object that can be used to get the users that are present in this Fluid session and
	 * listeners for when the roster has any changes from users joining/leaving the session.
	 */
	readonly audience: ITinyliciousAudience;
}

/**
 * Tinylicious {@link @fluidframework/fluid-static#IUser}.
 * @sealed
 * @public
 */
export interface TinyliciousUser extends IUser {
	/**
	 * The user's name
	 */
	readonly name: string;
}

/**
 * Tinylicious {@link @fluidframework/fluid-static#IMember}.
 * @sealed
 * @public
 */
export interface TinyliciousMember extends IMember {
	/**
	 * {@inheritDoc TinyliciousUser.name}
	 */
	readonly name: string;
}

/**
 * Tinylicious {@link @fluidframework/fluid-static#IServiceAudience}.
 * @sealed
 * @public
 */
export type ITinyliciousAudience = IServiceAudience<TinyliciousMember>;
