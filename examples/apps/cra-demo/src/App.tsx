/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import Fluid from "@fluid-experimental/fluid-static";
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

const service = new TinyliciousService();
Fluid.init(service);

const dataObjectId = "dateTracker";

const containerConfig = {
    dataObjects: [KeyValueDataObject],
    initialDataObjects: { [dataObjectId]: KeyValueDataObject }
};

function App() {

    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();
    const [data, setData] = React.useState<{ [key: string]: any }>({});

    React.useEffect(() => {
        if (!dataObject) {
            const { containerId, isNew } = getContainerId();

            const load = async () => {
                const fluidContainer = isNew
                    ? await Fluid.createContainer(containerId, containerConfig)
                    : await Fluid.getContainer(containerId, containerConfig);

                const keyValueDataObject = await fluidContainer.getDataObject<KeyValueDataObject>(dataObjectId)

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
            <span>{data["time"]}</span>
        </div>
    )
}

export default App;
