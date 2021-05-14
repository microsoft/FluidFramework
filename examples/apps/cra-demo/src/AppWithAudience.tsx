/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import TinyliciousClient from "@fluid-experimental/tinylicious-client";
import { FluidContainer } from "@fluid-experimental/fluid-static";
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

function App() {
    const [map, setMap] = React.useState<SharedMap>();
    const [container, setContainer] = React.useState<FluidContainer>();
    const [id, setId] = React.useState<string | undefined>();
    const [data, setData] = React.useState<{ [key: string]: any }>({});

    const createSession = () => {
        TinyliciousClient.init({ port: 7070 });

        const containerConfig = {
            name: "simple-container",
            initialObjects: {
                map: SharedMap,
            },
        };

        const { containerId, isNew } = getContainerId();

        const load = async () => {
            const fluidContainer = isNew
                ? await TinyliciousClient.createContainer({id: containerId}, containerConfig)
                : await TinyliciousClient.getContainer({id: containerId}, containerConfig);

            const sharedMap = fluidContainer.initialObjects.map as SharedMap;

            setContainer(fluidContainer);
            setMap(sharedMap);
        };

        void load();
    };

    const setupListeners = () => {
        const updateData = () => {
            if (map) {
                setData(Object.fromEntries(map.entries()));
            }
        };
        const updateId = (clientId: string) =>  setId(clientId);
        updateData();
        map?.on("valueChanged", updateData);
        container?.on("connected", updateId);
        return () => {
            map?.off("valueChanged", updateData);
            container?.off("connected", updateId);
        };
    };

    React.useEffect(() => {
        if (!container) {
            createSession();
        } else {
            setupListeners();
        }
    }, [map]);

    if (!map || !container) { return <div />; }

    const MemberList = () => {
        const members: string[] = Array.from(container.audience.getMembers().keys());
        return (
            <ul>
                { members && members.map((member: string) => {
                    return map.get(member)
                        ? <li> {map.get("lastEdit") === member ? "* " : ""}  {map.get(member)} </li>
                        : undefined;
                })}
            </ul>
        );
    };

    return (
        <div className="App">
            Name
            <input
                value={id ? map.get(id) : ''}
                type="text"
                autoComplete="off"
                onChange={(e) => id && map.set(id, e.target.value)}
            />
            <div>
                <button onClick={() => {
                    map.set("time", Date.now().toString());
                    map.set("lastEdit", id);
                }}>
                    click
            </button>
            </div>
            <div>{data["time"]}</div>
            <MemberList />
        </div>
    );
}

export default App;
