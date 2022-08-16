/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

export interface IExternalDataSourceEvents extends IEvent {
    (event: "dataWritten", listener: (data: string) => void);
}

/**
 * Class to let us fake having an external data source and abstract the particulars of its implementation.
 * In a more-real scenario, maybe this is communicating with some server via RESTful APIs.
 * Here we make it an event emitter just so we can render a reasonable debug view on it for demo purposes -- in those
 * more-realistic cases there's not an expectation that the data source pushes updates or anything.
 */
export class ExternalDataSource extends TypedEventEmitter<IExternalDataSourceEvents> {
    private externalInventoryData: string;

    public constructor() {
        super();
        this.externalInventoryData =
`version:one
Alpha:1
Beta:2
Gamma:3
Delta:4`;
    }

    public async fetchData(): Promise<string> {
        return this.externalInventoryData;
    }

    public async writeData(data: string): Promise<void> {
        // Write to persisted storage
        this.externalInventoryData = data;
        // Emit for debug views to update
        this.emit("dataWritten", data);
    }
}

export const externalDataSource = new ExternalDataSource();
