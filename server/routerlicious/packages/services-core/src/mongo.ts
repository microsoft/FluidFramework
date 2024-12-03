/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IDb, IDbFactory } from "./database";
import { debug } from "./debug";

/**
 * Helper class to manage access to database
 * \@TODO: Rename the file name as it behaves now as a generic DB Manager
 * @internal
 */
export class MongoManager {
	private databaseP: Promise<IDb>;
	public healthCheck: () => Promise<void>;

	constructor(
		private readonly factory: IDbFactory,
		private shouldReconnect = true,
		private readonly reconnectDelayMs = 1000,
		private readonly global = false,
	) {
		this.databaseP = this.connect(this.global);
		this.healthCheck = async (): Promise<void> => {
			const database = await this.databaseP;
			if (database.healthCheck === undefined) {
				return;
			}
			return database.healthCheck();
		};
	}

	/**
	 * Retrieves the database
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public getDatabase(): Promise<IDb> {
		return this.databaseP;
	}

	/**
	 * Closes the connection to DB
	 */
	public async close(): Promise<void> {
		debug("Call close connection to Db");
		Lumberjack.info("Call close connection to Db");
		this.shouldReconnect = false;
		const database = await this.databaseP;
		return database.close();
	}

	/**
	 * Creates a connection to the database
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	private connect(global = false): Promise<IDb> {
		const databaseP = this.factory.connect(global).then((db) => {
			db.on("error", (error) => {
				debug("DB Error", error);
				Lumberjack.error("DB Error", undefined, error);
				this.reconnect(this.reconnectDelayMs);
			});

			db.on("close", (value) => {
				debug("DB Close");
				Lumberjack.info("DB Close");
				this.reconnect(this.reconnectDelayMs);
			});

			db.on("reconnect", (value) => {
				debug("DB Reconnect");
				Lumberjack.info("DB Reconnect");
			});

			db.on("reconnectFailed", (value) => {
				debug("DB Reconnect failed");
				Lumberjack.error("DB Reconnect failed", undefined, value);
			});

			debug("Successfully connected");
			Lumberjack.info("Successfully connected to Db");
			return db;
		});

		databaseP.catch((error) => {
			error.isGlobalDb = global;
			debug("DB Connection Error", error);
			Lumberjack.error("DB Connection Error", { isGlobalDb: global }, error);
			this.reconnect(this.reconnectDelayMs);
		});

		debug("Connect requested");
		Lumberjack.info("Connect requested");
		return databaseP;
	}

	/**
	 * Reconnects to DB
	 */
	private reconnect(delay) {
		if (!this.shouldReconnect) {
			debug("Should not reconnect to Db");
			Lumberjack.info("Should not reconnect to Db");
			return;
		}

		this.databaseP = new Promise<IDb>((resolve) => {
			setTimeout(() => {
				const connectP = this.connect();
				resolve(connectP);
			}, delay);
		});
	}
}
