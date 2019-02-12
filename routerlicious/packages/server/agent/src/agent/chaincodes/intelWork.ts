import { ISharedObject } from "@prague/api-definitions";
import {
    ICodeLoader,
    IDocumentService,
    IPlatformFactory,
    ISequencedDocumentMessage,
    ITokenProvider,
    MessageType,
} from "@prague/container-definitions";
import { Container } from "@prague/container-loader";
import { IMapView, ISharedMap } from "@prague/map";
import { textAnalytics } from "../../intelligence";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";
import { IntelligentServicesManager } from "./intelligence";

export class IntelWork extends ChaincodeWork implements IWork {

    private intelligenceManager: IntelligentServicesManager;

    constructor(
        docId: string,
        tenantId: string,
        tokenProvider: ITokenProvider,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        platformFactory: IPlatformFactory,
        task: string,
        private config: any) {
        super(docId, tenantId, tokenProvider, service, codeLoader, platformFactory, task);
    }

    public async start(): Promise<void> {
        await this.loadChaincode(
            { localMinSeq: 0, encrypted: undefined, client: { type: "intel" } });
        const insightsMap = await this.document.runtime.getChannel("insights") as ISharedMap;
        const insightsMapView = await insightsMap.getView();
        this.processIntelligenceWork(this.document, insightsMapView);
    }

    public async stop(): Promise<void> {
        if (this.intelligenceManager) {
            await this.intelligenceManager.stop();
        }
        await super.stop();
    }

    public registerNewService(service: any) {
        this.intelligenceManager.registerService(service.factory.create(this.config.intelligence.resume));
    }

    private processIntelligenceWork(doc: Container, insightsMap: IMapView) {
        this.intelligenceManager = new IntelligentServicesManager(doc, insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(this.config.intelligence.textAnalytics));

        this.document.on("op", (op: ISequencedDocumentMessage, object?: ISharedObject) => {
            // TODO include object as part of op
            if (object) {
                if (op.type === MessageType.Operation) {
                    this.intelligenceManager.process(object);
                } else if (op.type === MessageType.Attach) {
                    this.intelligenceManager.process(object);
                }
            }
        });
    }
}
