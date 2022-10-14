export class LeafController {

    insertCallback: (leafName: string, leafPayload: string) => void;

    updateCallback: (leafName: string, leafPayload: string) => void;

    removeCallback: (leafName: string) => void;

    constructor(
        insertCallback: (leafName: string, leafPayload: string) => void,
        updateCallback: (leafName: string, leafPayload: string) => void,
        removeCallback: (leafName: string) => void
    ) {
        this.insertCallback = insertCallback;
        this.updateCallback = updateCallback;
        this.removeCallback = removeCallback;
    }

    public update(leafName: string, leafPayload: string) {
        this.updateCallback(leafName, leafPayload);
    }

    public insert(leafName: string, leafPayload: string) {
        this.insertCallback(leafName, leafPayload);
    }

    public remove(leafName: string,) {
        this.removeCallback(leafName);
    }
}