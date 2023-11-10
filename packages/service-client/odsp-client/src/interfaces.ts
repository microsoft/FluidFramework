/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ITokenProvider } from "@fluidframework/azure-client";
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
	 * Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
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

	/**
	 * Folder path where Fluid containers are created
	 */
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
	/**
	 * Retrieves tenant-specific attributes associated with the ODSP service for the current Fluid container.
	 * This includes information such as sharing URL and drive IDs.
	 *
	 * @returns A Promise that resolves after the container is attached, providing an object containing the `OdspServiceAttributes`.
	 * If the attachment is not yet complete or encounters an error, the Promise will be rejected.
	 */
	tenantAttributes: () => Promise<OdspServiceAttributes | undefined>;

	/**
	 * Provides an object that can be used to get the users that are present in this Fluid session and
	 * listeners for when the roster has any changes from users joining/leaving the session
	 */
	audience: IOdspAudience;
}

/**
 * Represents attributes specific to the ODSP service for a Fluid container.
 * @alpha
 */
export interface OdspServiceAttributes {
	/**
	 * The sharing URL for this container. It's the complete URL used as input to the `getContainer` function.
	 */
	sharingUrl: string;

	/**
	 * Get the RaaS drive ID associated with the container. This can be useful when managing multiple
	 * RaaS drives.
	 */
	driveId: string;
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
