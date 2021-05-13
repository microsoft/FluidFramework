/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import TinyliciousClient from "@fluid-experimental/tinylicious-client";
import { SharedMap } from "@fluidframework/map";

const getContainerId = (): { containerId: string; isNew: boolean } => {
    let isNew = false;
    if (location.hash.length === 0) {
        isNew = true;
        location.hash = Date.now().toString();
    }
    const containerId = location.hash.substring(1);
    return { containerId, isNew };
};

TinyliciousClient.init({ port: 7070 });

const containerConfig = {
    name: "simple-container",
    initialObjects: {
        map: SharedMap,
    },
};

function App() {
    const [map, setMap] = React.useState<SharedMap>();
    const [data, setData] = React.useState<{ [key: string]: any }>({});

    React.useEffect(() => {
        if (!map) {
            const { containerId, isNew } = getContainerId();

            const load = async () => {
                const fluidContainer = isNew
                    ? await TinyliciousClient.createContainer({ id: containerId }, containerConfig)
                    : await TinyliciousClient.getContainer({ id: containerId }, containerConfig);

                const sharedMap = fluidContainer.initialObjects.map as SharedMap;

                setMap(sharedMap);
            };

            void load();
            return () => {};
        } else {
            const updateData = () => setData(Object.fromEntries(map.entries()));
            updateData();
            map.on("valueChanged", updateData);
            return () => { map.off("valueChanged", updateData); };
        }
    }, [map]);

    if (!map) {
        return <div />;
    }

    return (
        <div className="App">
            <button onClick={() => map.set("time", Date.now().toString())}>
                click
            </button>
            <span>{data["time"]}</span>
        </div>
    );
}

export default App;
