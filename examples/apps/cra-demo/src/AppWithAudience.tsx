/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import Fluid, { FluidContainer } from "@fluid-experimental/fluid-static";
import { TinyliciousService } from "@fluid-experimental/get-container";

const getContainerId = (): { containerId: string; isNew: boolean } => {
    let isNew = false;
    if (location.hash.length === 0) {
        isNew = true;
        location.hash = Date.now().toString();
    }
    const containerId = location.hash.substring(1);
    return { containerId, isNew };
};





function App() {

    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();
    const [container, setContainer] = React.useState<FluidContainer>();
    const [id, setId] = React.useState<string | undefined>();
    const [data, setData] = React.useState<{ [key: string]: any }>({});

    const createSession = () => {
        const service = new TinyliciousService();
        Fluid.init(service);

        const dataObjectId = "dateTracker";

        const containerConfig = {
            dataObjects: [KeyValueDataObject],
            initialDataObjects: { [dataObjectId]: KeyValueDataObject }
        };

        const { containerId, isNew } = getContainerId();

        const load = async () => {
            const fluidContainer = isNew
                ? await Fluid.createContainer(containerId, containerConfig)
                : await Fluid.getContainer(containerId, containerConfig);

            const keyValueDataObject = await fluidContainer.getDataObject<KeyValueDataObject>(dataObjectId)

            setContainer(fluidContainer);
            setDataObject(keyValueDataObject);
        }

        load();
    }

    const setupListeners = () => {
        const updateData = () => setData(dataObject?.query());
        const updateId = (clientId: string) =>  setId(clientId);
        updateData();
        dataObject?.on("changed", updateData);
        container?.on("connected", updateId);
        return () => {
            dataObject?.off("changed", updateData)
            container?.off("connected", updateId);
        }
    }

    React.useEffect(() => {
        if (!container) {
            createSession();
        } else {
            setupListeners();
        }
    }, [dataObject]);


    if (!dataObject || !container) return <div />;


    const MemberList = () => {
        const members: string[] = Array.from(container.audience.getMembers().keys());
        return (
            <ul>
                { members && members.map((member: string) => {
                    return !!dataObject.get(member)
                        ? <li> {dataObject.get("lastEdit") === member ? "* " : ""}  {dataObject.get(member)} </li>
                        : undefined;
                })}
            </ul>
        )
    }

    return (
        <div className="App">
            Name
            <input
                value={id ? dataObject.get(id) : ''}
                type="text"
                autoComplete="off"
                onChange={(e) => id && dataObject.set(id, e.target.value)}
            />
            <div>
                <button onClick={() => {
                    dataObject.set("time", Date.now().toString())
                    dataObject.set("lastEdit", id)
                }}>
                    click
            </button>
            </div>
            <div>{data["time"]}</div>
            <MemberList />
        </div>
    )
}

export default App;
