import { ISharedMap, MapExtension } from "@prague/map";
import { IChannel, IRuntime } from "@prague/runtime-definitions";
import { SharedString, SharedStringExtension } from "@prague/sequence";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";

const rootMapId = "root";

/**
 * A document is a collection of collaborative types.
 */
export class Document {
    public static async Load(runtime: IRuntime): Promise<Document> {
        let root: ISharedMap;

        if (!runtime.existing) {
            root = runtime.createChannel(rootMapId, MapExtension.Type) as ISharedMap;
            root.attach();
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
    private constructor(public runtime: IRuntime, private root: ISharedMap) {
    }

    public getRoot(): ISharedMap {
        return this.root;
    }

    public createMap(id: string = uuid()): ISharedMap {
        return this.runtime.createChannel(id, MapExtension.Type) as ISharedMap;
    }

    public createString(id: string = uuid()): SharedString {
        return this.runtime.createChannel(id, SharedStringExtension.Type) as SharedString;
    }

    public createChannel(id: string, type: string): IChannel {
        return this.runtime.createChannel(id, type);
    }
}
