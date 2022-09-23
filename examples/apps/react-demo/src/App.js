/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedMap } from "fluid-framework";


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
        container.initialObjects.myMap.set(timeKey, Date.now().toString());
        const id = await container.attach();
        window.location.hash = id;
    } else {       
        ({ container } = await client.getContainer(containerId, containerSchema));
    }
    return container.initialObjects.myMap;
}

function App() {

    const [fluidMap, setFluidMap] = React.useState(undefined);
    React.useEffect(() => {
        getMyMap().then(myMap => setFluidMap(myMap));
    }, []);

    const [viewData, setViewData] = React.useState(undefined);
    React.useEffect(() => {
        if (fluidMap !== undefined) {
            // sync Fluid data into view state
            const syncView = () => setViewData({ time: fluidMap.get(timeKey) });
            // ensure sync runs at least once
            syncView();
            // update state each time our map changes
            fluidMap.on("valueChanged", syncView);
            // turn off listener when component is unmounted
            return () => { fluidMap.off("valueChanged", syncView) }
        }
    }, [fluidMap])


    if (!viewData) return <div />;

    // business logic could be passed into the view via context
    const setTime = () => fluidMap.set(timeKey, Date.now().toString());

    return (
        <div>
            <button onClick={setTime}> click </button>
            <span>{viewData.time}</span>
        </div>
    )
}

export default App;

