/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedSet } from "@fluidframework/set";


const client = new TinyliciousClient();

const containerSchema = {
    initialObjects: { mySet: SharedSet }
};

const getMyMap = async () => {
    let container;
    const containerId = window.location.hash.substring(1);
    if (!containerId) {
        ({ container } = await client.createContainer(containerSchema));
        const mySet = container.initialObjects.mySet as SharedSet
        mySet.add(Date.now().toString());
    console.log("here")
    const id = await container.attach();
    window.location.hash = id;
    } else {
        ({ container } = await client.getContainer(containerId, containerSchema));
    }
    return container.initialObjects.mySet as SharedSet;
}

function App() {

    const [fluidMap, setFluidMap] = useState<SharedSet>();

    useEffect(() => {
        if (fluidMap !== undefined) {
            // sync Fluid data into view state
            console.log(fluidMap)
        }else{
            getMyMap().then((mySet:SharedSet) => setFluidMap(mySet));
        }
    }, [fluidMap])



    // business logic could be passed into the view via context
    const addTime = () => {
        if(fluidMap === undefined) return console.log("undefined fluidMap")
        fluidMap.add(Date.now().toString());
    }

    return (
        <div>
            <button onClick={addTime}> click </button>
        </div>
    )
}

export default App;

