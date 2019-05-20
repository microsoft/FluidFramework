import { ISharedMap, MapExtension } from "@prague/map";
import { IComponentRuntime } from "@prague/runtime-definitions";

const rootMapId = "root";
const insightsMapId = "insights";

/**
 * A document is a collection of collaborative types.
 */
export class Document {
    public static async Load(runtime: IComponentRuntime): Promise<Document> {
        let root: ISharedMap;

        if (!runtime.existing) {
            root = runtime.createChannel(rootMapId, MapExtension.Type) as ISharedMap;
            root.attach();

            const insights = runtime.createChannel(insightsMapId, MapExtension.Type);
            root.set(insightsMapId, insights);
        } else {
            root = await runtime.getChannel("root") as ISharedMap;
        }

        const document = new Document(runtime, root);

        return document;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.runtime.existing;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(public runtime: IComponentRuntime, private root: ISharedMap) {
    }

    public getRoot(): ISharedMap {
        return this.root;
    }
}
