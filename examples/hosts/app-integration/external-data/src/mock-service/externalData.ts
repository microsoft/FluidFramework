/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

// prettier-ignore
const startingExternalData =
`12:Alpha:1
34:Beta:2
56:Gamma:3
78:Delta:4`;

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
    private data: string;

    public constructor() {
        super();

        this.data = startingExternalData;
    }

    /**
     * Fetch the external data.
     *
     * @returns A promise that resolves with the raw string data stored in the external source.
     *
     * @remarks This is async to simulate the more-realistic scenario of a network request.
     *
     * @privateRemarks
     *
     * TODO: This is not a particularly realistic response for typical external data.
     * Should this instead return more structured data?
     * Maybe something that looks like a Response that we can .json()?
     */
    public async fetchData(): Promise<string> {
        return this.data;
    }

    /**
     * Write the specified data to the external source.
     * @param data - The string data to write.
     * @returns A promise that resolves when the write completes.
     * TODO: Similar to fetchData, this could be made more realistic.
     */
    public async writeData(data: string): Promise<void> {
        this.data = data;

        // Emit for debug views to update
        this.emit("debugDataWritten");
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
