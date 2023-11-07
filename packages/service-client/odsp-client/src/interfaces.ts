/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ITokenProvider } from "@fluidframework/azure-client";
import { type IConfigProviderBase } from "@fluidframework/telemetry-utils";

/**
 * OdspConnectionConfig defines the necessary properties that will be applied to all containers
 * created by an OdspClient instance. This includes callbacks for the authentication tokens
 * required for ODSP.
 *
 * @alpha
 */
export interface OdspConnectionConfig {
	/**
	 * Site url representing ODSP resource location
	 */
	siteUrl: string;

	/**
	 * Instance that provides AAD endpoint tokens for Push and SharePoint
	 */
	tokenProvider: ITokenProvider;

	/**
	 * RaaS Drive Id of the tenant where Fluid containers are created
	 */
	driveId: string;

	path: string;
}

/**
 * @alpha
 */
export interface OdspClientProps {
	/**
	 * Configuration for establishing a connection with the ODSP Fluid Service (Push).
	 */
	readonly connection: OdspConnectionConfig;

	/**
	 * Optional. A logger instance to receive diagnostic messages.
	 */
	readonly logger?: ITelemetryBaseLogger;

	/**
	 * Base interface for providing configurations to control experimental features. If unsure, leave this undefined.
	 */
	readonly configProvider?: IConfigProviderBase;
}

/**
 * OdspContainerServices is returned by the OdspClient alongside a FluidContainer. It holds the
 * functionality specifically tied to the ODSP service, and how the data stored in the
 * FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to
 * use, will not be included here but rather on the FluidContainer class itself.
 *
 * @alpha
 */
export interface OdspContainerServices {
	tenantAttributes: () => Promise<OdspServiceAttributes>;

	/**
	 * Provides an object that can be used to get the users that are present in this Fluid session and
	 * listeners for when the roster has any changes from users joining/leaving the session
	 */
	audience?: IOdspAudience;
}

/**
 * This interface holds attributes specific to the odsp service
 *
 * @alpha
 */
export interface OdspServiceAttributes {
	/**
	 * Generates a new link to point to this container based on the ContainerServiceConfiguration
	 * this container was created with. If it was shared, this will create a new share link according
	 * to the scope defined on the config. Otherwise, it will return a direct file link.
	 */
	sharingUrl: string | undefined;

	itemId: string | undefined;

	driveId: string | undefined;
}

/**
 * @alpha
 */
export interface OdspMember extends IMember {
	userName: string;
	email: string;
}

/**
 * @alpha
 */
export type IOdspAudience = IServiceAudience<OdspMember>;
