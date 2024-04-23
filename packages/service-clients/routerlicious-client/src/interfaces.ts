import type { BaseClientProps } from "@fluidframework/base-client";
import { type ITokenProvider } from "@fluidframework/routerlicious-driver";

/**
 * Props for initializing a new RouterliciousClient instance
 * @public
 */
export interface RouterliciousClientProps extends BaseClientProps {
	/**
	 * Configuration for establishing a connection with the Routerlicious Fluid Relay.
	 */
	readonly connection: RouterliciousConnectionConfig;
}

/**
 * Parameters for establishing a connection with the Routerlicious Fluid Relay.
 * @public
 */
export interface RouterliciousConnectionConfig {
	/**
	 * URI to the Azure Fluid Relay orderer endpoint
	 */
	orderer: string;
	/**
	 * URI to the Azure Fluid Relay storage endpoint
	 */
	storage: string;
	/**
	 * Unique tenant identifier
	 */
	tenantId: string;
	/**
	 * Instance that provides Azure Fluid Relay endpoint tokens
	 */
	tokenProvider: ITokenProvider;
}
