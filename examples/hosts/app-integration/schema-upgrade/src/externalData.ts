/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import EventEmitter from "events";

/**
 * Class to let us fake having an external data source and abstract the particulars of its implementation.
 * In a more-real scenario, maybe this is communicating with some server via RESTful APIs.
 * Here we make it an event emitter just so we can render a reasonable debug view on it for demo purposes -- in those
 * more-realistic cases there's not an expectation that the data source pushes updates or anything.
 */
class ExternalDataSource extends EventEmitter {
    public async fetchData(): Promise<string> {
        const inventoryData =
`Alpha:1
Beta:2
Gamma:3
Delta:4`;
        return inventoryData;
    }

    public async writeData(data: string): Promise<void> {
        // Write to persisted storage
        console.log("Wrote data:");
        console.log(data);
    }
}

export const dataSource = new ExternalDataSource();
