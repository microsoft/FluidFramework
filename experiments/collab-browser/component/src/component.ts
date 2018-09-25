import { IMap, IMapView, MapExtension } from "@prague/map";
import { IRuntime } from "@prague/runtime-definitions";
// import { CollaborativeStringExtension, SharedString } from "@prague/shared-string";
import { EventEmitter } from "events";
import { urlToInclusion } from "../../../../routerlicious/packages/client-ui/src/blob";

const rootMapId = "root";
const insightsMapId = "insights";
// const imageStringId = "image";

const createdDateKey = "__debug_created";
const imageKey = "imageSha";
const widthKey = "width";
const heightKey = "height";

export const componentSym = "component";

export class Component extends EventEmitter {
    private runtime?: IRuntime;
    private rootMap?: IMap;
    private rootView?: IMapView;

    public async connect(runtime: IRuntime) {
        console.log("connect");
        this.runtime = runtime;
        if (this.runtime.existing) {
            console.log("existing");
            // If opening the document, get the root.
            this.rootMap = await this.runtime.getChannel(rootMapId) as IMap;
            // console.log("1");
            // this.imageString = await this.runtime.getChannel(imageStringId) as SharedString;
            // console.log("2");
        } else {
            console.log("not existing");
            // If creating the document, create the initial structure.
            this.rootMap = this.runtime.createChannel(rootMapId, MapExtension.Type) as IMap;
            this.rootMap.attach();

            const insights = this.runtime.createChannel(insightsMapId, MapExtension.Type);
            this.rootMap.set(insightsMapId, insights);

            // As an example, record the date/time the document was created.
            this.rootMap.set(createdDateKey, new Date());
            this.rootMap.set(widthKey, 0);
            this.rootMap.set(heightKey, 0);
            this.rootMap.set(imageKey, "");

            // console.log("before createChannel");
            // this.imageString =
            //     this.runtime.createChannel(imageStringId, CollaborativeStringExtension.Type) as SharedString;
            // console.log("after createChannel");
        }

        this.rootMap.on("valueChanged", (change) => {
            // When an image is updated, imageKey is the last key to be set.
            if (change.key === imageKey) {
                this.emit("valueChanged", { change });
            }
        });

        console.log("before await");
        this.rootView = await this.rootMap.getView();

        console.log("finished connect");
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

        const image = (await this.runtime.getBlob(sha)).url;

        return { height, image, width };
    }
}
