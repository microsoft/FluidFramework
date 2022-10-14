
import { SharedPropertyTree } from "@fluid-experimental/property-dds";
import { v4 as uuid } from "uuid"
import * as assert from 'assert';
import { initMap, SharedPropertyMap, DeleteCallback, UpdateCallback } from "../index";

const DEMO_PAYLOAD = "large & complex payload";

describe("Local map test", function () {

    let sharedMap: SharedPropertyMap = undefined;

    let localModel: Map<string, string> = new Map<string, string>();

    let correlationId: string = undefined;

    const updateLocalModel: UpdateCallback = (key: string, value: string) => {
        console.log(`Updating local model ${key} -> ${value}`);
        assert.equal(DEMO_PAYLOAD, value);
        localModel.set(key, value);
    }

    const deleteLocalModel: DeleteCallback = (key: string) => {
        console.log(`Deleting local model ${key}`);
        localModel.delete(key);
    }

    const shareData = async (data: Map<string, string>): Promise<string> => {
        
        sharedMap = await initMap(
            undefined,
            updateLocalModel,
            updateLocalModel,
            deleteLocalModel
        );

        console.log(`Initialize remote map w/ initMap("${sharedMap.mapId()}", SharedPropertyTree, updateLocalModel, updateLocalModel, deleteLocalModel) to collaborate`)
        
        sharedMap.insertMany(data);
        sharedMap.commit();
        
        return sharedMap.mapId();
    }

    const deleteSharedData = () => {
        for (const key of localModel.keys()) {
            sharedMap.delete(key);
        }
        sharedMap.commit();
    }

    const cleanUp = () => {
        localModel = new Map<string, string>();
    }

    const dispose = () => {
        console.log(`Disposing the distributed map "${sharedMap.mapId()}"`);
        sharedMap.dispose();
    }

    afterAll(() => {
        cleanUp();
        dispose();
    });

    test("Publishing test", async () => {
        const data = new Map([[uuid(), DEMO_PAYLOAD]]);
        await shareData(data).then((mapId) => {
            console.log(`Done publishing data mapId${mapId}`);
            correlationId = mapId;
            sharedMap.forEach((value, key) => {
                console.log(`Reading published entry ok "${key} => ${value}"`)
            });
            assert.equal(1, localModel.size);
        });
    });

    test("Delete test", () => {
        const propertyTreeKeysBefore = sharedMap.keys();
        console.log(`Before delete, property tree keys ${JSON.stringify(propertyTreeKeysBefore)}`);
        assert.equal(1, propertyTreeKeysBefore.length);
        deleteSharedData();
        const propertyTreeKeysAfter = sharedMap.keys();
        console.log(`After delete, property tree keys ${JSON.stringify(propertyTreeKeysAfter)}`);
        assert.equal(0, propertyTreeKeysAfter.length);
        console.log(`Done deleting data`);
        sharedMap.forEach((value, key) => {
            console.log(`This entry should not exist "${key} => ${value}"`);
        });
        assert.equal(0, localModel.size);
    });
});