import React, { useEffect, useState } from 'react';
import './App.css';
import { initMap } from '@fluid-experimental/shared-property-map';
import { simpleMaterialJson } from '@dstanesc/fake-material-data'

function App() {

    const [materials, setMaterials] = useState(new Map());

    const [sharedPropertyMap, setSharedPropertyMap] = useState();

    const mapId = window.location.hash.substring(1) || undefined;

    useEffect(() => {
        async function init() {
            const sharedMap = await initMap(
                mapId,
                updateLocalModel,
                updateLocalModel,
                deleteLocalModel
            );
            if (mapId === undefined) {
                window.location.hash = sharedMap.mapId();
            }

            sharedMap.forEach((value, key) => {
                updateLocalModel(key, value)
            });

            setSharedPropertyMap(sharedMap);
        }
        init();
    }, []);

    const updateLocalModel = (key, value) => {
        setMaterials(new Map(materials.set(key, value)))
    };

    const deleteLocalModel = (key) => {
        console.log(`Deleting local model ${key}`);
    };

    const addMaterials = count => {
        for (let i = 0; i < count; i++) {
            addMaterial()
        }
        sharedPropertyMap.commit();
    }

    const addMaterial = () => {
        const mat = simpleMaterialJson();
        const name = mat.name;
        sharedPropertyMap.set(name, JSON.stringify(mat));
    }

    const computeSize = () => {
        return Array.from(materials.values()).map(value => new TextEncoder().encode(value).byteLength).reduce((prev, curr) => prev + curr, 0)
    }
    return (
        <div className="App">
            <div className="commit" onClick={() => addMaterials(4)}>
                ADD 4
            </div>
            <div className="commit" onClick={() => addMaterials(1)}>
                ADD 1
            </div>
            <div className="commit" >
                {materials.size} Mat, {(computeSize() / (1024 * 1024)).toFixed(2)} MiB
            </div>
        </div>
    );
}

export default App;
