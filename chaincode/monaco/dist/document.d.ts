import { ISharedMap } from "@prague/map";
import { IChannel, IRuntime } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
/**
 * A document is a collection of collaborative types.
 */
export declare class Document {
    runtime: IRuntime;
    private root;
    static Load(runtime: IRuntime): Promise<Document>;
    /**
     * Flag indicating whether the document already existed at the time of load
     */
    readonly existing: boolean;
    /**
     * Constructs a new document from the provided details
     */
    private constructor();
    getRoot(): ISharedMap;
    createMap(id?: string): ISharedMap;
    createString(id?: string): SharedString;
    createChannel(id: string, type: string): IChannel;
}
//# sourceMappingURL=document.d.ts.map