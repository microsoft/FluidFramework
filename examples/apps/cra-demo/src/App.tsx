/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { KeyValueDataObject, KeyValueInstantiationFactory } from "@fluid-experimental/data-objects";
import { Fluid } from "@fluid-experimental/fluid-static";
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

type KVData = { [key: string]: any };
type SetKVPair = (key: string, value: any) => void;

// useKVPair is an example of a custom hook that returns Fluid backed state and a method to modify that state
function useKVPair(): [KVData, SetKVPair | undefined] {
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();
    const [data, setData] = React.useState<{ [key: string]: any }>({});

    React.useEffect(() => {
        const { containerId, isNew } = getContainerId();

        const load = async () => {
            const tinyliciousService = new TinyliciousService();
            const fluidDocument = isNew
                ? await Fluid.createDocument(tinyliciousService, containerId, [KeyValueInstantiationFactory.registryEntry])
                : await Fluid.getDocument(tinyliciousService, containerId, [KeyValueInstantiationFactory.registryEntry]);

            const keyValueDataObject: KeyValueDataObject = isNew
                ? await fluidDocument.createDataObject(KeyValueInstantiationFactory.type, 'kvpairId')
                : await fluidDocument.getDataObject('kvpairId');

            setDataObject(keyValueDataObject);
        }

        load();

    }, [])

    React.useEffect(() => {
        if (dataObject) {
            const updateData = () => setData(dataObject.query());
            dataObject.on("changed", updateData);
            return () => { dataObject.off("change", updateData) }
        }
    }, [dataObject]);

    return [data, dataObject?.set];
}

function App() {
    const [data, setPair] = useKVPair();

    if (!data || !setPair) return <div />;

    return (
        <div className="App">
            <button onClick={() => setPair("time", Date.now().toString())}>
                click
            </button>
            <span>{data.time}</span>
        </div>
    )
}

export default App;
