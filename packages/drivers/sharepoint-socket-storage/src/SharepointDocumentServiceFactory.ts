import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { ISequencedDeltaOpMessage, ISocketStorageDiscovery } from "./contracts";
import { HttpGetter, IGetter } from "./Getter";
import { SharepointDocumentService } from "./SharepointDocumentService";

export interface ISnapshot {
    id: string;
    sha: string;
    trees: resources.ITree[];
    blobs: resources.IBlob[];
    ops: ISequencedDeltaOpMessage[];
}

export class SharepointDocumentServiceFactory implements IDocumentServiceFactory {
    private readonly storageGetter: IGetter;
    private readonly deltasGetter: IGetter;

    /**
     * @param appId app id used for telemetry for network requests
     * @param snapshot snapshot
     * @param socketStorageDiscovery the initial JoinSession response
     * @param joinSession function to invoke to re-run JoinSession
     * @param storageGetter if not provided httpgetter will be used
     * @param deltasGetter if not provided httpgetter will be used
     */
    constructor(
        private readonly appId: string,
        private readonly snapshot: Promise<ISnapshot | undefined>,
        private readonly socketStorageDiscoveryP: Promise<ISocketStorageDiscovery>,
        private readonly joinSession: () => Promise<ISocketStorageDiscovery>,
        storageGetter?: IGetter,
        deltasGetter?: IGetter,
    ) {
        this.storageGetter = storageGetter || new HttpGetter();
        this.deltasGetter = deltasGetter || new HttpGetter();
    }

    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        return this.socketStorageDiscoveryP.then(
            (socketStorageDiscovery) =>
                new SharepointDocumentService(
                    this.appId,
                    this.snapshot,
                    this.storageGetter,
                    this.deltasGetter,
                    socketStorageDiscovery,
                    this.joinSession,
                ),
        );
    }
}
