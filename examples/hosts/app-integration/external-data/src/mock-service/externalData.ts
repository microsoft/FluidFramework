/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { Response } from "node-fetch";
import { TaskData } from "../model-interface";

const startingExternalData: TaskData = {
	12: {
		name: "Alpha",
		priority: 1,
	},
	34: {
		name: "Beta",
		priority: 2,
	},
	56: {
		name: "Gamma",
		priority: 3,
	},
	78: {
		name: "Delta",
		priority: 4,
	},
};

/**
 * Events emitted by {@link ExternalDataSource}.
 */
export interface IExternalDataSourceEvents extends IEvent {
	/**
	 * Emitted when the external data changes.
	 * @remarks Debug API for demo purposes - the real scenario will need to learn about the data changing via the
	 * webhook path.
	 */
	(event: "debugDataWritten", listener: () => void);
}

/**
 * Class to let us fake having an external data source and abstract the particulars of its implementation.
 *
 * @remarks
 *
 * In a more-real scenario, maybe this is communicating with some server via RESTful APIs.
 *
 * It's an event emitter just so we can render a reasonable debug view on it for demo purposes - in more-realistic
 * cases we would expect to learn about data updates through webhooks or similar.
 *
 * @privateRemarks
 *
 * TODO: Consider adding a fake delay to the async calls to give us a better approximation of expected experience.
 */
export class ExternalDataSource extends TypedEventEmitter<IExternalDataSourceEvents> {
	private data: TaskData;

	public constructor() {
		super();

		this.data = startingExternalData;
	}

	/**
	 * Fetch the external data.
	 *
	 * @returns A promise that resolves with the object stored in the external source.
	 *
	 * @remarks This is async to simulate the more-realistic scenario of a network request.
	 */
	public async fetchData(): Promise<Response> {
		const jsonData = { taskList: this.data };
		return new Response(JSON.stringify(jsonData), {
			status: 200,
			statusText: "OK",
			headers: { "Content-Type": "application/json" },
		});
	}

	/**
	 * Write the specified data to the external source.
	 * @param data - The string data to write.
	 * @returns A promise that resolves when the write completes.
	 */
	public async writeData(data: TaskData): Promise<Response> {
		this.data = data;

		// Emit for debug views to update
		this.emit("debugDataWritten");
		return new Response(undefined, {
			status: 200,
			statusText: "OK",
			headers: { "Content-Type": "application/json" },
		});
	}

	/**
	 * Reset the external data to a good demo state.
	 * @remarks Debug API for demo purposes, not really something we'd expect to find on a real external data source.
	 */
	public readonly debugResetData = (): void => {
		this.data = startingExternalData;

		// Emit for debug views to update
		this.emit("debugDataWritten");
	};
}
