/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { type ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { type ITokenProvider } from "@fluidframework/azure-client";
import { type IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { type IUser } from "@fluidframework/protocol-definitions";

/**
 * Defines the necessary properties that will be applied to all containers
 * created by an OdspClient instance. This includes callbacks for the authentication tokens
 * required for ODSP.
 *
 * @alpha
 */
export interface OdspConnectionConfig {
	/**
	 * Instance that provides AAD endpoint tokens for Push and SharePoint
	 */
	tokenProvider: ITokenProvider;

	/**
	 * Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
	 */
	siteUrl: string;

	/**
	 * RaaS Drive Id of the tenant where Fluid containers are created
	 */
	driveId: string;
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
	/**
	 * Provides an object that facilitates obtaining information about users present in the Fluid session, as well as listeners for roster changes triggered by users joining or leaving the session.
	 */
	audience: IOdspAudience;
}

/**
 * Since ODSP provides user names and email for all of its members, we extend the
 * {@link @fluidframework/protocol-definitions#IMember} interface to include this service-specific value.
 * @alpha
 */
export interface OdspUser extends IUser {
	/**
	 * The user's name
	 */
	name: string;

	/**
	 * The user's email
	 */
	email: string;
}

/**
 * Since ODSP provides user names and email for all of its members, we extend the
 * {@link @fluidframework/protocol-definitions#IMember} interface to include this service-specific value.
 * It will be returned for all audience members connected.
 * @alpha
 */
export interface OdspMember extends IMember {
	name: string;
	email: string;
}

/**
 * Audience object for ODSP containers
 * @alpha
 */
export type IOdspAudience = IServiceAudience<OdspMember>;
