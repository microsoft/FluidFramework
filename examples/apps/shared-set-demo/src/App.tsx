/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React, { ReactElement, useEffect, useState } from "react";
import { SharedSet } from "@fluidframework/set";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

const client = new TinyliciousClient();

const containerSchema = {
    initialObjects: { mySet: SharedSet },
};

const getMySet = async () => {
    const containerId = window.location.hash.substring(1);
    const container = !containerId
        ? // If there is no id in the hash of the url, create new container
          await getContainerWithoutId()
        : // If there is an id in the hash of the url, connect to previous container
          await getContainerWithId(containerId);

    return container.initialObjects.mySet as SharedSet;
};
const getContainerWithoutId = async () => {
    const { container } = await client.createContainer(containerSchema);
    const mySet = container.initialObjects.mySet as SharedSet;
    mySet.add(Date.now().toString());
    const id = await container.attach();
    window.location.hash = id;
    return container;
};
const getContainerWithId = async (containerId: string) => {
    const { container } = await client.getContainer(
        containerId,
        containerSchema
    );
    return container;
};

const App = (): ReactElement<any, any> => {
    const [fluidSet, setFluidSet] = useState<SharedSet>();
    const [viewData, setViewData] = useState<string>();

    useEffect(() => {
        getMySet().then((mySet) => setFluidSet(mySet));
        if (fluidSet !== undefined) {
            // sync Fluid data into view state
            const syncView = () => setViewData("");
            // ensure sync runs at least once
            syncView();
            // update state each time our map changes
            fluidSet.on("valueChanged", syncView);
            // turn off listener when component is unmounted
            return () => {
                fluidSet.off("valueChanged", syncView);
            };
        }
    }, [fluidSet]);

    if (!viewData || !fluidSet) return <div />;

    // business logic could be passed into the view via context
    const setTime = () => fluidSet.add(Date.now().toString());

    return (
        <div>
            <button onClick={setTime}> click </button>
            <span>{viewData}</span>
        </div>
    );
};

export default App;
