import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import { SharedMap } from "@prague/map";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { StreamExtension } from "./extension";
import { IDelta, IInkLayer, IStream } from "./interfaces";
import { ISnapshot, Snapshot } from "./snapshot";

/**
 * Ink snapshot definition.
 */
export interface IInkSnapshot {
    minimumSequenceNumber: number;
    sequenceNumber: number;
    snapshot: ISnapshot;
}

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = "header";

/**
 * An empty ISnapshot (used for initializing to empty).
 */
const emptySnapshot: ISnapshot = { layers: [], layerIndex: {} };

/**
 * Inking data structure.
 */
export class Stream extends SharedMap implements IStream {
    /**
     * The current ink snapshot.
     */
    private inkSnapshot: Snapshot;

    /**
     * Create a new Stream.
     *
     * @param runtime - The runtime the Stream will attach to
     * @param id - UUID for the stream
     */
    constructor(runtime: IComponentRuntime, id: string) {
        super(id, runtime, StreamExtension.Type);
    }

    /**
     * Get the ink layers from the snapshot.
     */
    public getLayers(): IInkLayer[] {
        return this.inkSnapshot.layers;
    }

    /**
     * Get a specific layer from the snapshot.
     *
     * @param key - The UUID for the layer
     */
    public getLayer(key: string): IInkLayer {
        return this.inkSnapshot.layers[this.inkSnapshot.layerIndex[key]];
    }

    /**
     * Send the op and apply.
     *
     * @param op - Op to submit
     */
    public submitOp(op: IDelta) {
        this.submitLocalMessage(op);
        this.inkSnapshot.apply(op);
    }

    /**
     * Initialize the stream with a snapshot from the given storage.
     *
     * @param minimumSequenceNumber - Not used
     * @param headerOrigin - Not used
     * @param storage - Storage service to read from
     */
    protected async loadContent(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read(snapshotFileName);
        /* tslint:disable:no-unsafe-any */
        const data: ISnapshot = header
            ? JSON.parse(Buffer.from(header, "base64")
                .toString("utf-8"))
            : emptySnapshot;
        this.initialize(data);
    }

    /**
     * Initialize an empty stream.
     */
    protected initializeContent() {
        this.initialize(emptySnapshot);
    }

    /**
     * Get a snapshot of the current content as an ITree.
     */
    protected snapshotContent(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.inkSnapshot),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        return tree;
    }

    /**
     * Apply a delta to the snapshot.
     *
     * @param message - The message containing the delta to apply
     * @param local - Whether the message is local
     */
    protected processContent(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation && !local) {
            this.inkSnapshot.apply(message.contents as IDelta);
        }
    }

    /**
     * Initialize the stream with data from an existing snapshot.
     *
     * @param data - The snapshot to initialize from
     */
    private initialize(data: ISnapshot) {
        this.inkSnapshot = Snapshot.clone(data);
    }
}
