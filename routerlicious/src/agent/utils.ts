import { api, types } from "../client-api";

export async function getTaskMapView(doc: api.Document): Promise<types.IMapView> {
    const rootMapView = await doc.getRoot().getView();
    await waitForTaskMap(rootMapView);
    return await (rootMapView.get("tasks") as types.IMap).getView();
}

function waitForTaskMap(root: types.IMapView): Promise<void> {
    return new Promise<void>((resolve, reject) => pollTaskMap(root, resolve, reject));
}

function pollTaskMap(root: types.IMapView, resolve, reject) {
    if (root.has("tasks")) {
        resolve();
    } else {
        const pauseAmount = 50;
        console.log(`Did not find taskmap - waiting ${pauseAmount}ms`);
        setTimeout(() => pollTaskMap(root, resolve, reject), pauseAmount);
    }
}
