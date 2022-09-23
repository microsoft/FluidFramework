/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedMap } from "@fluidframework/map";


const client = new TinyliciousClient();

const containerSchema = {
    initialObjects: { myMap: SharedMap }
};

const timeKey = "time-key";

const getMyMap = async () => {
    let container;
    const containerId = window.location.hash.substring(1);
    if (!containerId) {
        ({ container } = await client.createContainer(containerSchema));
        const myMap = container.initialObjects.myMap as SharedMap
        myMap.set(timeKey, Date.now().toString());
        const id = await container.attach();
        window.location.hash = id;
    } else {
        ({ container } = await client.getContainer(containerId, containerSchema));
    }
    return container.initialObjects.myMap as SharedMap;
}

function App2() {

    const [fluidMap, setFluidMap] = useState<SharedMap>();
    useEffect(() => {
        getMyMap().then(myMap => setFluidMap(myMap));
    }, []);

    // const [viewData, setViewData] = React.useState(undefined);
    useEffect(() => {
        if (fluidMap !== undefined) {
        }
    }, [fluidMap])

    const setTime = () => fluidMap?.set(Date.now().toString(), Date.now().toString());

    // if (!viewData) return <button onClick={setTime}> click </button>;

    return (
        <div>
            <button onClick={setTime}> click </button>
            {/* <span>{viewData.time}</span> */}
        </div>
    )
}

export default App2;

