/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { Fluid } from "@fluid-experimental/fluid-static";
import { TinyliciousService } from "@fluid-experimental/get-container";

const getContainerId = (): { containerId: string; isNew: boolean } => {
    let isNew = false;
    if (location.hash.length === 0) {
        isNew = true;
        location.hash = Date.now().toString();
    }
    const containerId = location.hash.substring(1);
    return { containerId, isNew };
};

function App() {

    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();
    const [data, setData] = React.useState<{ [key: string]: any }>({});

    React.useEffect(() => {
        if (!dataObject) {
            const { containerId, isNew } = getContainerId();

            const load = async () => {
                const service = new TinyliciousService();
                const fluidContainer = isNew
                    ? await Fluid.createContainer(service, containerId, [KeyValueDataObject])
                    : await Fluid.getContainer(service, containerId, [KeyValueDataObject]);

                const keyValueDataObject: KeyValueDataObject = isNew
                    ? await fluidContainer.createDataObject(KeyValueDataObject, 'kvpairId')
                    : await fluidContainer.getDataObject('kvpairId');

                setDataObject(keyValueDataObject);
            }

            load();
        } else {
            const updateData = () => setData(dataObject.query());
            updateData();
            dataObject.on("changed", updateData);
            return () => { dataObject.off("change", updateData) }
        }
    }, [dataObject]);

    if (!dataObject) return <div />;

    return (
        <div className="App">
            <button onClick={() => dataObject.set("time", Date.now().toString())}>
                click
            </button>
            <span>{data.time}</span>
        </div>
    )
}

export default App;
