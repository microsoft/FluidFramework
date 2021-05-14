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
    const id = window.location.hash.substring(1);
    return { id, isNew };
};

TinyliciousClient.init();

const getFluidData = async () => {
    const containerSchema = {
        name: 'cra-demo-container',
        initialObjects: { myMap: SharedMap }
    };

    const { id, isNew } = getContainerId();
    const fluidContainer = isNew
        ? await TinyliciousClient.createContainer({ id }, containerSchema)
        : await TinyliciousClient.getContainer({ id }, containerSchema);
    // returned initialObjects are live Fluid data structures
    return fluidContainer.initialObjects;
}

function App() {

    const [fluidData, setFluidData] = React.useState();
    const [time, setViewTime] = React.useState('');

    React.useEffect(() => {
        if (fluidData === undefined) {
            // Get/Create container and return live Fluid data
            getFluidData().then(data => setFluidData(data));
        } else {
            // set up initial UI state
            setViewTime(fluidData.myMap.get("time"));

            // sync Fluid data into view state
            const handleChange = () => setViewTime(fluidData.myMap.get("time"));

            // update state each time our map changes
            fluidData.myMap.on("valueChanged", handleChange);
            return () => { fluidData.myMap.off("valueChanged", handleChange) }
        }
    }, [fluidData]);

    if (!fluidData) return <div />;

    // business logic could be passed into the view via context
    const setTime = () => fluidData.myMap.set("time", Date.now().toString());

    return (
        <div>
            <button onClick={setTime}> click </button>
            <span>{time}</span>
        </div>
    )
}

export default App;
