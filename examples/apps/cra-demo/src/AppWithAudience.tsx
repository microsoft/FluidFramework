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
    const [data, setData] = React.useState<{ [key: string]: any }>({});

    React.useEffect(() => {
        if (!dataObject) {
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
        } else if (container !== undefined) {
            const updateData = () => setData(dataObject.query());
            updateData();
            dataObject.on("changed", updateData);
            container.audience.on("addMember", updateData)
            container.audience.on("removeMember", updateData)
            return () => {
                dataObject.off("change", updateData)
                container.audience.off("addMember", updateData)
                container.audience.off("removeMember", updateData)

            }
        }
    }, [dataObject]);


    if (!dataObject || !container) return <div />;

    const myId = container.getId();

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
            Name <input type="text" autoComplete="off" onChange={(e) => myId && dataObject.set(myId, e.target.value)} />
            <div>
                <button onClick={() => {
                    dataObject.set("time", Date.now().toString())
                    dataObject.set("lastEdit", myId)
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
