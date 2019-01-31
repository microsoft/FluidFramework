import * as loader from "@prague/loader";
import { IMap, IMapView } from "@prague/map";
import {
    ICodeLoader,
    IDocumentService,
    IPlatformFactory,
    ISequencedDocumentMessage,
    ITokenProvider,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import * as Sequence from "@prague/sequence";
import { textAnalytics } from "../../intelligence";
import { IWork} from "../definitions";
import { ChaincodeWork } from "./chaincodeWork";
import { IntelligentServicesManager } from "./intelligence";

export class IntelWork extends ChaincodeWork implements IWork {

    private intelligenceManager: IntelligentServicesManager;

    constructor(
        docId: string,
        tenantId: string,
        user: IUser,
        tokenProvider: ITokenProvider,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        platformFactory: IPlatformFactory,
        task: string,
        private config: any) {
        super(docId, tenantId, user, tokenProvider, service, codeLoader, platformFactory, task);
    }

    public async start(): Promise<void> {
        await this.loadChaincode(
            { localMinSeq: 0, encrypted: undefined, client: { type: "intel" } });
        const rootMap = await this.document.runtime.getChannel("root") as IMap;
        const insightsMap = await this.document.runtime.getChannel("insights") as IMap;
        const insightsMapView = await insightsMap.getView();
        const rootMapView = await rootMap.getView();
        const sharedText = rootMapView.get("text") as Sequence.SharedString;
        this.processIntelligenceWork(this.document, insightsMapView, sharedText);
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

    private processIntelligenceWork(
        doc: loader.Document,
        insightsMap: IMapView,
        sharedText: Sequence.SharedString) {
        this.intelligenceManager = new IntelligentServicesManager(doc, insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(this.config.intelligence.textAnalytics));

        this.document.on("op", (op: ISequencedDocumentMessage) => {
            if (op.type === MessageType.Operation) {
                this.intelligenceManager.process(sharedText);
            } else if (op.type === MessageType.Attach) {
                this.intelligenceManager.process(sharedText);
            }
        });
    }
}
