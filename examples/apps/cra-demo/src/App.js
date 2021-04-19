/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Fluid from "@fluid-experimental/fluid-static";
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { TinyliciousService, RouterliciousService } from "@fluid-experimental/get-container";

const getContainerId = () => {
    let isNew = false;
    if (window.location.hash.length === 0) {
        isNew = true;
        window.location.hash = Date.now().toString();
    }
    const containerId = window.location.hash.substring(1);
    return { containerId, isNew };
};

Fluid.init(new TinyliciousService());


function App() {

    const [dataObject, setDataObject] = React.useState();
    const [data, setData] = React.useState({});

    React.useEffect(() => {
        if (!dataObject) {
            const { containerId, isNew } = getContainerId();
            const containerConfig = {
                name: 'container-name',
                initialObjects: { kvpair: KeyValueDataObject }
            };

            const load = async () => {
                const fluidContainer = isNew
                    ? await Fluid.createContainer(containerId, containerConfig)
                    : await Fluid.getContainer(containerId, containerConfig);

                const initialObjects = fluidContainer.initialObjects;

                setDataObject(initialObjects.kvpair);
            }

            load();
        } else {
            const updateData = () => setData(dataObject.query());
            updateData();
            dataObject.on("changed", updateData);
            return () => { dataObject.off("change", updateData) }
        }
    }, [dataObject]);

    if (!dataObject) return <div>loading</div>;

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
