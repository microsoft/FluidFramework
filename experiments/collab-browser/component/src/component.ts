import { EventEmitter } from "events";
import { urlToInclusion } from "../../../../routerlicious/packages/client-ui/src/blob";
import { IMap, IMapView, MapExtension } from "../../../../routerlicious/packages/map";
import { IRuntime } from "../../../../routerlicious/packages/runtime-definitions";

const rootMapId = "root";
const insightsMapId = "insights";

const createdDateKey = "__debug_created";
const imageKey = "imageSha";
const widthKey = "width";
const heightKey = "height";

export const componentSym = "component";

export class Component extends EventEmitter {

    public static async load(runtime: IRuntime) {
        console.log("connect");

        let rootMap: IMap;
        if (runtime.existing) {
            console.log("existing");
            // If opening the document, get the root.
            rootMap = await runtime.getChannel(rootMapId) as IMap;
        } else {
            console.log("not existing");
            // If creating the document, create the initial structure.
            rootMap = runtime.createChannel(rootMapId, MapExtension.Type) as IMap;
            rootMap.attach();

            const insights = runtime.createChannel(insightsMapId, MapExtension.Type);
            rootMap.set(insightsMapId, insights);
            rootMap.set(createdDateKey, new Date());
            rootMap.set(widthKey, 0);
            rootMap.set(heightKey, 0);
            rootMap.set(imageKey, "");
        }

        return new Component(runtime, await rootMap.getView());
    }
    private readonly rootMap: IMap;

    constructor(private readonly runtime: IRuntime, private readonly rootView: IMapView) {
        super();
        this.rootMap = rootView.getMap();

        this.rootMap.on("valueChanged", (change) => {
            // When an image is updated, imageKey is the last key to be set.
            if (change.key === imageKey) {
                this.emit("valueChanged", { change });
            }
        });

    }

    public async setImage(image: string, width: number, height: number) {
        this.rootMap.set(widthKey, width);
        this.rootMap.set(heightKey, height);
        const blobData = await urlToInclusion(image);
        await this.runtime.uploadBlob(blobData);
        this.rootMap.set(imageKey, blobData.sha);

        console.log(`*** setImage(width: ${width}, height: ${height}, image: ${blobData.sha})`);
    }

    public async getImage(): Promise<{ height: number, image: string, width: number }> {
        const height = this.rootView.get(heightKey);
        const width = this.rootView.get(widthKey);
        const sha = this.rootView.get(imageKey);
        console.log(`*** getImage(width: ${width}, height: ${height}, image: ${sha})`);

        let image = "";
        if (sha) {
            try {
                image = (await this.runtime.getBlob(sha)).url;
            } catch (error) { console.error(`Unable get blob: ${error}`); }
        }

        return { height, image, width };
    }
}
