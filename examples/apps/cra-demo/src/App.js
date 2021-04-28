/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Fluid from "@fluid-experimental/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { TinyliciousService } from "@fluid-experimental/get-container";

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

    const [map, setMap] = React.useState();
    const [time, setTime] = React.useState('');

    React.useEffect(() => {
        if (!map) {
            const { containerId, isNew } = getContainerId();
            const containerConfig = {
                name: 'cra-demo-container',
                initialObjects: { map: SharedMap }
            };

            const load = async () => {
                const fluidContainer = isNew
                    ? await Fluid.createContainer(containerId, containerConfig)
                    : await Fluid.getContainer(containerId, containerConfig);

                setMap(fluidContainer.initialObjects.map);
            }

            load();
        } else {
            // set up initial state
            setTime(map.get("time"));
            // update state each time our map changes
            const handleChange = () => setTime(map.get("time"));

            map.on("valueChanged", handleChange);
            return () => { map.off("valueChanged", handleChange) }
        }
    }, [map]);

    if (!map) return <div/>;

    return (
        <div className="App">
            <button onClick={() => map.set("time", Date.now().toString())}>
                click
            </button>
            <span>{time}</span>
        </div>
    )
}

export default App;
