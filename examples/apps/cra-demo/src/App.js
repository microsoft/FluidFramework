/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import TinyliciousClient from "@fluid-experimental/tinylicious-client";
import { SharedMap } from "@fluidframework/map";

const getContainerId = () => {
    let isNew = false;
    if (window.location.hash.length === 0) {
        isNew = true;
        window.location.hash = Date.now().toString();
    }
    const containerId = window.location.hash.substring(1);
    return { containerId, isNew };
};

const tinyliciousClient = new TinyliciousClient();

const getFluidData = async () => {
    const { containerId, isNew } = getContainerId();

    const containerSchema = {
        name: 'cra-demo-container',
        initialObjects: { mySharedMap: SharedMap }
    };

    const serviceConfig = { id: containerId };

    const fluidContainer = isNew
        ? await tinyliciousClient.createContainer(serviceConfig, containerSchema)
        : await tinyliciousClient.getContainer(serviceConfig, containerSchema);
    // returned initialObjects are live Fluid data structures
    return fluidContainer.initialObjects;
}

function App() {

    const [fluidData, setFluidData] = React.useState();
    const [viewData, setViewData] = React.useState();

    React.useEffect(() => {
        // Get/Create container and return live Fluid data
        getFluidData().then(data => setFluidData(data))
    }, []);

    React.useEffect(() => {
        if (!fluidData) return;

        const { mySharedMap } = fluidData;
        // sync Fluid data into view state
        const syncView = () => setViewData({ time: mySharedMap.get("time") });
        // ensure sync runs at least once
        syncView();
        // update state each time our map changes
        mySharedMap.on("valueChanged", syncView);
        return () => { mySharedMap.off("valueChanged", syncView) }

    }, [fluidData])


    if (!viewData) return <div />;

    // business logic could be passed into the view via context
    const setTime = () => fluidData.mySharedMap.set("time", Date.now().toString());

    return (
        <div>
            <button onClick={setTime}> click </button>
            <span>{viewData.time}</span>
        </div>
    )
}

export default App;

