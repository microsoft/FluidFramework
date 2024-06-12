/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { type IUser } from "@fluidframework/driver-definitions";
import { type IMember, type IServiceAudience } from "@fluidframework/fluid-static";
import { type ITokenProvider } from "@fluidframework/routerlicious-driver";

/**
 * Properties for initializing a {@link TinyliciousClient}
 * @beta
 */
export interface TinyliciousClientProps {
	/**
	 * Optional. Configuration for establishing a connection with the Tinylicious.
	 * If not specified, will use {@link TinyliciousConnectionConfig}'s default values.
	 */
	connection?: TinyliciousConnectionConfig;

	/**
	 * Optional. A logger instance to receive diagnostic messages.
	 */
	logger?: ITelemetryBaseLogger;
}

/**
 * Parameters for establishing a connection with the a Tinylicious service.
 * @beta
 */
export interface TinyliciousConnectionConfig {
	/**
	 * Optional. Override of the port.
	 *
	 * @defaultValue {@link @fluidframework/tinylicious-driver#defaultTinyliciousPort}
	 */
	port?: number;

	/**
	 * Optional. Override of the domain.
	 *
	 * @defaultValue {@link @fluidframework/tinylicious-driver#defaultTinyliciousEndpoint}
	 */
	domain?: string;

	/**
	 * Optional. Override of tokenProvider. If a param is not provided, TinyliciousConnectionConfig
	 * will use the default tokenProvider which is InsecureTinyliciousTokenProvider with default scopes,
	 * which are document read, write and summarizer write.
	 *
	 * @defaultValue {@link @fluidframework/tinylicious-driver#InsecureTinyliciousTokenProvider}
	 */
	tokenProvider?: ITokenProvider;
}

/**
 * Holds the functionality specifically tied to the Tinylicious service, and how the data stored in
 * the {@link @fluidframework/fluid-static#IFluidContainer} is persisted in the backend and consumed by users.
 *
 * @remarks
 * Any functionality regarding how the data is handled within the FluidContainer itself (e.g., which data objects or
 * DDSes to use) will not be included here but rather on the FluidContainer class itself.
 *
 * Returned by {@link TinyliciousClient.createContainer} alongside the FluidContainer.
 *
 * @beta
 */
export interface TinyliciousContainerServices {
	/**
	 * Provides an object that can be used to get the users that are present in this Fluid session and
	 * listeners for when the roster has any changes from users joining/leaving the session.
	 */
	audience: ITinyliciousAudience;
}

/**
 * Tinylicious {@link @fluidframework/fluid-static#IUser}.
 * @beta
 */
export interface TinyliciousUser extends IUser {
	/**
	 * The user's name
	 */
	name: string;
}

/**
 * Tinylicious {@link @fluidframework/fluid-static#IMember}.
 * @beta
 */
export interface TinyliciousMember extends IMember {
	/**
	 * {@inheritDoc TinyliciousUser.name}
	 */
	name: string;
}

/**
 * Tinylicious {@link @fluidframework/fluid-static#IServiceAudience}.
 * @beta
 */
export type ITinyliciousAudience = IServiceAudience<TinyliciousMember>;
