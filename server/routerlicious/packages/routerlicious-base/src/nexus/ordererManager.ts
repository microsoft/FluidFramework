/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import type { LocalOrderManager } from "@fluidframework/server-memory-orderer";
import type {
	IOrderer,
	IOrdererManager,
	ITenantManager,
} from "@fluidframework/server-services-core";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

/**
 * @internal
 */
export interface IOrdererManagerOptions {
	/**
	 * How long to wait after the last connection is removed before cleaning up the orderer connection.
	 * Default: 60s.
	 */
	ordererConnectionCleanupTimeoutMs: number;
	/**
	 * Whether to enable connection  cleanup. Default: true.
	 */
	enableConnectionCleanup: boolean;
}

const DefaultOrdererManagerOptions: IOrdererManagerOptions = {
	ordererConnectionCleanupTimeoutMs: 60_000,
	enableConnectionCleanup: true,
};

/**
 * @internal
 */
export class OrdererManager implements IOrdererManager {
	private readonly ordererConnectionTypeMap = new Map<string, "kafka" | "local">();
	private readonly ordererConnectionCountMap = new Map<string, number>();
	private readonly ordererConnectionCloseTimeoutMap = new Map<string, NodeJS.Timeout>();

	private readonly options: IOrdererManagerOptions;

	constructor(
		private readonly globalDbEnabled: boolean,
		private readonly ordererUrl: string,
		private readonly tenantManager: ITenantManager,
		private readonly localOrderManager: LocalOrderManager,
		private readonly kafkaFactory: KafkaOrdererFactory,
		options: Partial<IOrdererManagerOptions> = {},
	) {
		this.options = { ...DefaultOrdererManagerOptions, ...options };
	}

	private startCleanupTimer(tenantId: string, documentId: string): void {
		// Make sure no timer is running already.
		this.stopCleanupTimer(tenantId, documentId);
		const ordererId = this.getOrdererConnectionMapKey(tenantId, documentId);
		const lumberBaseProperties = getLumberBaseProperties(documentId, tenantId);
		const cleanupOrdererConnectionTimeout = setTimeout(() => {
			this.cleanupOrdererConnection(tenantId, documentId)
				.then(() => {
					Lumberjack.info(`Successfully cleaned up orderer connection`, {
						...lumberBaseProperties,
						remainingConnections: this.ordererConnectionCountMap.size,
					});
				})
				.catch((error) => {
					Lumberjack.error(
						`Failed to cleanup orderer connection`,
						lumberBaseProperties,
						error,
					);
				});
		}, this.options.ordererConnectionCleanupTimeoutMs);
		// Cleanup the connection after some time to avoid frequent connection creation/destruction
		this.ordererConnectionCloseTimeoutMap.set(ordererId, cleanupOrdererConnectionTimeout);
	}
	private stopCleanupTimer(tenantId: string, documentId: string): void {
		const ordererId = this.getOrdererConnectionMapKey(tenantId, documentId);
		if (this.ordererConnectionCloseTimeoutMap.has(ordererId)) {
			clearTimeout(this.ordererConnectionCloseTimeoutMap.get(ordererId));
		}
	}

	public async getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
		const ordererConnectionType = await this.getOrdererConnectionType(tenantId, documentId);

		// Clear any existing connection timeout because a new connection was added.
		this.stopCleanupTimer(tenantId, documentId);

		if (ordererConnectionType === "local") {
			Lumberjack.info(`Using local orderer`, getLumberBaseProperties(documentId, tenantId));
			const localOrderer = await this.localOrderManager.get(tenantId, documentId);

			this.updateOrdererConnectionCount(tenantId, documentId, "increment", "local").catch(
				(error) => {
					Lumberjack.error(
						`Failed to update local orderer connection count`,
						{
							documentId,
							tenantId,
						},
						error,
					);
				},
			);

			return localOrderer;
		}

		Lumberjack.info(`Using Kafka orderer`, getLumberBaseProperties(documentId, tenantId));
		const kafkaOrderer = await this.kafkaFactory.create(tenantId, documentId);

		this.updateOrdererConnectionCount(tenantId, documentId, "increment", "kafka").catch(
			(error) => {
				Lumberjack.error(
					`Failed to update kafka orderer connection count`,
					{
						documentId,
						tenantId,
					},
					error,
				);
			},
		);

		return kafkaOrderer;
	}

	public async removeOrderer(tenantId: string, documentId: string): Promise<void> {
		if (!this.options.enableConnectionCleanup) {
			return;
		}

		const ordererConnectionCount = await this.updateOrdererConnectionCount(
			tenantId,
			documentId,
			"decrement",
		);

		if (ordererConnectionCount !== undefined && ordererConnectionCount <= 0) {
			this.startCleanupTimer(tenantId, documentId);
		}
	}

	private async updateOrdererConnectionCount(
		tenantId: string,
		documentId: string,
		operation: "increment" | "decrement",
		ordererType?: "kafka" | "local",
	): Promise<number | undefined> {
		if (!this.options.enableConnectionCleanup) {
			return;
		}

		const ordererConnectionType =
			ordererType ?? (await this.getOrdererConnectionType(tenantId, documentId));
		const ordererId = this.getOrdererConnectionMapKey(tenantId, documentId);

		if (!this.ordererConnectionCountMap.has(ordererId)) {
			if (operation === "decrement") {
				// If decrementing a connection that doesn't exist, ignore it.
				return;
			}
			this.ordererConnectionTypeMap.set(ordererId, ordererConnectionType);
			this.ordererConnectionCountMap.set(ordererId, 0);
		}
		const ordererConnectionCount =
			(this.ordererConnectionCountMap.get(ordererId) ?? 0) +
			(operation === "increment" ? 1 : -1);

		this.ordererConnectionCountMap.set(ordererId, ordererConnectionCount);
		return ordererConnectionCount;
	}

	private getOrdererConnectionMapKey(tenantId: string, documentId: string): string {
		return `${tenantId}/${documentId}`;
	}

	private async getOrdererConnectionType(
		tenantId: string,
		documentId: string,
	): Promise<"kafka" | "local"> {
		const ordererId = this.getOrdererConnectionMapKey(tenantId, documentId);
		const cachedOrdererConnectionType = this.ordererConnectionTypeMap.get(ordererId);
		if (cachedOrdererConnectionType !== undefined) {
			return cachedOrdererConnectionType;
		}
		if (!this.globalDbEnabled) {
			const messageMetaData = { documentId, tenantId };
			Lumberjack.info(`Global db is disabled, checking orderer URL`, messageMetaData);
			const tenant = await this.tenantManager.getTenant(tenantId, documentId);

			Lumberjack.info(
				`tenant orderer: ${JSON.stringify(tenant.orderer)}`,
				getLumberBaseProperties(documentId, tenantId),
			);

			if (tenant.orderer.url !== this.ordererUrl) {
				Lumberjack.error(`Invalid ordering service endpoint`, { messageMetaData });
				throw new Error("Invalid ordering service endpoint");
			}

			if (tenant.orderer.type !== "kafka") {
				this.ordererConnectionTypeMap.set(ordererId, "local");
				return "local";
			}
		}
		this.ordererConnectionTypeMap.set(ordererId, "kafka");
		return "kafka";
	}

	private async cleanupOrdererConnection(tenantId: string, documentId: string): Promise<void> {
		if (!this.options.enableConnectionCleanup) {
			return;
		}

		const ordererId = this.getOrdererConnectionMapKey(tenantId, documentId);
		const ordererConnectionCount = this.ordererConnectionCountMap.get(ordererId) ?? 0;
		if (ordererConnectionCount > 0) {
			// There are active connections, so don't close the connection yet.
			return;
		}
		const ordererConnectionType = await this.getOrdererConnectionType(tenantId, documentId);
		// Clean up internal maps
		this.ordererConnectionTypeMap.delete(ordererId);
		this.ordererConnectionCountMap.delete(ordererId);
		this.ordererConnectionCloseTimeoutMap.delete(ordererId);
		// Close the connection
		await (ordererConnectionType === "kafka"
			? this.kafkaFactory.delete(tenantId, documentId)
			: this.localOrderManager.remove(tenantId, documentId));
	}
}
