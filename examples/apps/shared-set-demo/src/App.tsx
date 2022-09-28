/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedSet } from "@fluidframework/set";

const client = new TinyliciousClient();

const containerSchema = { initialObjects: { mySet: SharedSet } };

const getMyMap = async () => {
    let container;
    const containerId = window.location.hash.substring(1);
    if (!containerId) {
        ({ container } = await client.createContainer(containerSchema));
        const mySet = container.initialObjects.mySet as SharedSet;
        mySet.add(Date.now().toString());
        const id = await container.attach();
        window.location.hash = id;
    } else {
        ({ container } = await client.getContainer(
            containerId,
            containerSchema
        ));
    }
    return container.initialObjects.mySet as SharedSet;
};

function App() {
    const [fluidMap, setFluidMap] = useState<SharedSet>();
    const [value, setValue] = useState("");

    useEffect(() => {
        if (fluidMap !== undefined) {
            // sync Fluid data into view state
            console.log(fluidMap.get());
        } else {
            getMyMap().then((mySet: SharedSet) => setFluidMap(mySet));
        }
    }, [fluidMap]);

    const add = () => {
        if (fluidMap === undefined) return console.log("undefined fluidMap");
        fluidMap.add(value);
    };
    const remove = () => {
        if (fluidMap === undefined) return console.log("undefined fluidMap");
        fluidMap.delete(value);
    };
    const has = () => {
        if (fluidMap === undefined) return console.log("undefined fluidMap");
        console.log(fluidMap.has(value));
    };

    const clear = () => {
        if (fluidMap === undefined) return console.log("undefined fluidMap");
        fluidMap.clear();
    };

    return (
        <>
            <div>
                <input
                    type="text"
                    name="value"
                    onChange={({ target: { value } }) => setValue(value)}
                    value={value}
                />
                {"\n"}
                <button onClick={add}> add </button>
                {"\n"}
                <button onClick={remove}> delete </button>
                {"\n"}
                <button onClick={has}> has </button>
                {"\n"}
                <button onClick={clear}> clear </button>
            </div>
            {"\n"}
        </>
    );
}

export default App;
