import React from 'react';
import { KeyValueDataObject, KeyValueInstantiationFactory, IKeyValueDataObject } from "@fluid-experimental/data-objects";
import { Fluid } from '@fluid-experimental/fluid-static';
import { getContainerId } from './getContainerId';


function useKVPair() {
    const [dataObject, setDataObject] = React.useState<IKeyValueDataObject>();
    const [state, setState] = React.useState<{ [key: string]: any }>({});
    const id = 'app';
    // Connect to container and data object
    React.useEffect(() => {
        const { containerId, isNew } = getContainerId();

        const start = async () => {
            const fluidDocument = isNew
                ? await Fluid.createDocument(containerId, [KeyValueInstantiationFactory.registryEntry])
                : await Fluid.getDocument(containerId, [KeyValueInstantiationFactory.registryEntry]);

            // We'll create the data object when we create the new document.
            const keyValueDataObject: IKeyValueDataObject = isNew
                ? await fluidDocument.createDataObject<KeyValueDataObject>(KeyValueInstantiationFactory.type, id)
                : await fluidDocument.getDataObject<KeyValueDataObject>(id);

            setDataObject(keyValueDataObject);
        }

        start();

    }, [])

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
