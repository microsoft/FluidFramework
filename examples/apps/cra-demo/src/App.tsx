import React from 'react';
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { Fluid } from '@fluid-experimental/fluid-static';

function useKVPair() {
    const [dataObject, setDataObject] = React.useState<KeyValueDataObject>();
    const [state, setState] = React.useState<{ [key: string]: any }>({});

    // // Connect to container and data object
    // React.useEffect(() => {
    //     const { containerId, isNew } = getContainerId();

    //     Fluid.getDataObject<KeyValueDataObject>(
    //         containerId,
    //         KeyValueDataObject,
    //         isNew
    //     ).then(obj => setDataObject(obj))
    // }, [])

    // set up sync from data object to local state
    React.useEffect(() => {
        if (dataObject) {
            const updateState = () => setState(dataObject.query());
            dataObject.on('changed', updateState);
            return () => { dataObject.off("change", updateState) }
        }
    }, [dataObject])

    // return properties to give access to data and method to modify data
    return { state, setState: dataObject?.set };
}

function App() {
    const { state, setState } = useKVPair();

    if (!setState) return <div />;

    const handleClick = () => setState('date', Date.now().toString());

    return (
        <div className="App">
            <button onClick={handleClick} > click </button>
            <span>{state.date}</span>
        </div>
    )
}

export default App;
