/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { IConfigProviderBase } from "@fluidframework/core-interfaces";
import { IOdspTokenProvider } from "./token.js";

/**
 * Defines the necessary properties that will be applied to all containers
 * created by an OdspClient instance. This includes callbacks for the authentication tokens
 * required for ODSP.
 * @beta
 */
export interface OdspConnectionConfig {
	/**
	 * Instance that provides AAD endpoint tokens for Push and SharePoint
	 */
	tokenProvider: IOdspTokenProvider;

	/**
	 * Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
	 */
	siteUrl: string;

	/**
	 * RaaS Drive Id of the tenant where Fluid containers are created
	 */
	driveId: string;

	/**
	 * Specifies the file path where Fluid files are created. If passed an empty string, the Fluid files will be created at the root level.
	 */
	filePath: string;
}
/**
 * @beta
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
 * @alpha
 */
export interface OdspContainerAttachProps {
	/**
	 * The file path where Fluid containers are created. If undefined, the file is created at the root.
	 */
	filePath: string | undefined;

	/**
	 * The file name of the Fluid file. If undefined, the file is named with a GUID.
	 */
	fileName: string | undefined;
}

/**
 * OdspContainerServices is returned by the OdspClient alongside a FluidContainer. It holds the
 * functionality specifically tied to the ODSP service, and how the data stored in the
 * FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to
 * use, will not be included here but rather on the FluidContainer class itself.
 * @beta
 */
export interface OdspContainerServices {
	/**
	 * Provides an object that facilitates obtaining information about users present in the Fluid session, as well as listeners for roster changes triggered by users joining or leaving the session.
	 */
	audience: IOdspAudience;
}

/**
 * Since ODSP provides user names and email for all of its members, we extend the
 * {@link @fluidframework/fluid-static#IMember} interface to include this service-specific value.
 * It will be returned for all audience members connected.
 * @beta
 */
export interface OdspMember extends IMember {
	/**
	 * The object ID (oid) for the user, unique among each individual user connecting to the session.
	 */
	userId: string;
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
 * Audience object for ODSP containers
 * @beta
 */
export type IOdspAudience = IServiceAudience<OdspMember>;
