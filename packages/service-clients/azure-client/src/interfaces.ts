import type { BaseClientProps } from "@fluidframework/base-client";
import type { ITokenProvider } from "@fluidframework/routerlicious-driver";

/**
 * Props for initializing a new AzureClient instance
 * @public
 */
export interface AzureClientProps extends BaseClientProps {
	/**
	 * Configuration for establishing a connection with the Azure Fluid Relay.
	 */
	readonly connection: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;
}

/**
 * Parameters for establishing a remote connection with the Azure Fluid Relay.
 * @public
 */
export interface AzureRemoteConnectionConfig extends AzureConnectionConfig {
	/**
	 * The type of connection. Set to a remote connection.
	 */
	type: "remote";
	/**
	 * Unique tenant identifier.
	 */
	tenantId: string;
}

/**
 * Parameters for establishing a local connection with a local instance of the Azure Fluid Relay.
 * @public
 */
export interface AzureLocalConnectionConfig extends AzureConnectionConfig {
	/**
	 * The type of connection. Set to a remote connection.
	 */
	type: "local";
}

/**
 * The type of connection.
 *
 * - "local" for local connections to a Fluid relay instance running on the localhost
 *
 * - "remote" for client connections to the Azure Fluid Relay service
 * @public
 */
export type AzureConnectionConfigType = "local" | "remote";

/**
 * Parameters for establishing a connection with the Azure Fluid Relay.
 * @public
 */
export interface AzureConnectionConfig {
	/**
	 * The type of connection. Whether we're connecting to a remote Fluid relay server or a local instance.
	 */
	type: AzureConnectionConfigType;
	/**
	 * URI to the Azure Fluid Relay service discovery endpoint.
	 */
	endpoint: string;
	/**
	 * Instance that provides Azure Fluid Relay endpoint tokens.
	 */
	tokenProvider: ITokenProvider;
}
