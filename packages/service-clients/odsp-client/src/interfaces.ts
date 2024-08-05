/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IConfigProviderBase,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import type {
	ISharingLinkKind,
	ShareLinkInfoType,
	IPersistedCache,
	HostStoragePolicy,
} from "@fluidframework/odsp-driver-definitions/internal";

import type { IOdspTokenProvider } from "./token.js";

/**
 * Defines the necessary properties that will be applied to all containers
 * created by an OdspClient instance. This includes callbacks for the authentication tokens
 * required for ODSP.
 * @beta
 */
export interface OdspSiteIdentification {
	/**
	 * Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
	 */
	siteUrl: string;

	/**
	 * SharePoint Embedded Container Id of the tenant where Fluid containers are created
	 */
	driveId: string;
}

/**
 * Defines the necessary properties that will be applied to all containers
 * created by an OdspClient instance. This includes callbacks for the authentication tokens
 * required for ODSP.
 * @beta
 */
export interface OdspConnectionConfig extends OdspSiteIdentification {
	/**
	 * Instance that provides AAD endpoint tokens for Push and SharePoint
	 */
	tokenProvider: IOdspTokenProvider;
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

	/**
	 * Optional. This interface can be implemented by the host to provide durable caching across sessions.
	 */
	readonly persistedCache?: IPersistedCache;

	/**
	 * Optional. Defines various policies controlling behavior of ODSP driver
	 */
	readonly hostPolicy?: HostStoragePolicy;
}

/**
 * Argument type of IFluidContainer.attach() for containers created by IOdspClient
 * Specifies location / name of the file.
 * If no argument is provided, file with random name (uuid) will be created.
 * @alpha
 */
export type OdspContainerAttachArgType =
	| {
			/**
			 * The file path where Fluid containers are created. If undefined, the file is created at the root.
			 */
			filePath?: string | undefined;

			/**
			 * The file name of the Fluid file. If undefined, the file is named with a GUID.
			 * If a file with such name exists, file with different name is created - Sharepoint will
			 * add (2), (3), ... to file name to make it unique and avoid conflict on creation.
			 */
			fileName?: string | undefined;

			/**
			 * If provided, will instrcuct Sharepoint to create a sharing link as part of file creation flow.
			 */
			createShareLinkType?: ISharingLinkKind;
	  }
	| {
			/**
			 * (Microsoft internal only) Files supporting FF format on alternate partition could point to existing file.
			 */
			itemId: string;
	  };

/**
 * An object type returned by IOdspFluidContainer.attach() call. *
 * @alpha
 */
export interface OdspContainerAttachReturnType {
	/**
	 * An ID of the document created. This ID could be passed to future IOdspClient.getContainer() call
	 */
	itemId: string;

	/**
	 * If OdspContainerAttachArgType.createShareLinkType was provided at the time of IOdspFluidContainer.attach() call,
	 * this value will contain sharing link information for created file.
	 */
	shareLinkInfo?: ShareLinkInfoType;

	/**
	 * If sharing link info was requested to be generated and successfully was obtained, this property will
	 * contain sharing link that could be used with IOdspClient.getContainer() to open such container by anyone
	 * who poses such link (and is within the sharing scope of a link)
	 * This link is sufficient to identify a file in Sharepoint. In other words, it encodes information like driveId, itemId, siteUrl.
	 */
	sharingLink?: string;
}

/**
 * IFluidContainer.attach() function signature for IOdspClient
 * @param param - Specifies where file should be created and how it should be named. If not provided,
 * file with random name (uuid) will be created in the root of the drive.
 * @alpha
 */
export type OdspContainerAttachType = (
	param?: OdspContainerAttachArgType,
) => Promise<OdspContainerAttachReturnType>;

/**
 * Type of argument to IOdspClient.getContainer()
 * @alpha
 */
export type OdspGetContainerArgType =
	| {
			/**
			 * If itemId is provided, then OdspSiteIdentification information (see OdspClientProps.connection) passed to createOdspClient()
			 * is used together with itemId to identify a file in Sharepoint.
			 */
			itemId: string;
	  }
	| {
			/**
			 * A sharing link could be provided to identify a file. This link has to be in very specific format - see
			 * OdspContainerAttachReturnType.sharingLink, result of calling IOdspFluidContainer.
			 * When sharing link is provided, it uniquely identifies a file in Sharepoint - OdspSiteIdentification information
			 * (part of OdspClientProps.connection provided to createOdspClient()) is ignored in such case.
			 *
			 * This is used to save the network calls while doing trees/latest call as if the client does not have
			 * permission then this link can be redeemed for the permissions in the same network call.
			 */
			sharingLinkToRedeem: string;
	  };

/**
 * OdspContainerServices is returned by the OdspClient alongside a FluidContainer. It holds the
 * functionality specifically tied to the ODSP service, and how the data stored in the
 * FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to
 * use, will not be included here but rather on the FluidContainer class itself.
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
 * {@link @fluidframework/fluid-static#IMember} interface to include this service-specific value.
 * It will be returned for all audience members connected.
 * @alpha
 */
export interface OdspMember extends IMember {
	/**
	 * The object ID (oid) for the user, unique among each individual user connecting to the session.
	 */
	id: string;
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
 * @alpha
 */
export type IOdspAudience = IServiceAudience<OdspMember>;

/**
 * Represents token response
 * @beta
 */
export interface TokenResponse {
	/**
	 * Token value
	 */
	token: string;

	/**
	 * Whether or not the token was obtained from local cache.
	 * @remarks `undefined` indicates that it could not be determined whether or not the token was obtained this way.
	 */
	fromCache?: boolean;
}
