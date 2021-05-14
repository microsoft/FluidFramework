/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

const initFluidData = async (setData) => {
    const containerConfig = {
        name: 'cra-demo-container',
        initialObjects: { myMap: SharedMap }
    };

    const { id, isNew } = getContainerId();
    const fluidContainer = isNew
        ? await TinyliciousClient.createContainer({ id }, containerConfig)
        : await TinyliciousClient.getContainer({ id }, containerConfig);
    setData(fluidContainer.initialObjects);
}

function App() {

    const [fluid, setFluidData] = React.useState();
    const [time, setViewTime] = React.useState('');

    React.useEffect(() => {
        if (fluid === undefined) {
            // Get/Create container and set up our Fluid data structures
            initFluidData(setFluidData);
        } else {
            // set up initial UI state
            setTime(fluid.myMap.get("time"));

            // sync Fluid data into view state
            const handleChange = () => setViewTime(fluid.myMap.get("time"));

            // update state each time our map changes
            fluid.myMap.on("valueChanged", handleChange);
            return () => { fluid.myMap.off("valueChanged", handleChange) }
        }
    }, [fluid]);

    if (!fluid) return <div />;

    // business logic could be passed into the app via context
    const setTime = () => fluid.myMap.set("time", Date.now().toString());

    return (
        <div>
            <button onClick={setTime}> click </button>
            <span>{time}</span>
        </div>
    )
}

export default App;
