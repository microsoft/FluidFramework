import { ICollaborativeObject } from "@prague/api-definitions";
import * as api from "@prague/client-api";
import { IMap, IMapView } from "@prague/map";
import { IDocumentService, ISequencedDocumentMessage, MessageType } from "@prague/runtime-definitions";
import { nativeTextAnalytics, textAnalytics } from "../intelligence";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";
import { IntelligentServicesManager } from "./intelligence";

export class IntelWork extends BaseWork implements IWork {

    private intelligenceManager: IntelligentServicesManager;

    constructor(docId: string, private token: string, config: any, private service: IDocumentService) {
        super(docId, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { localMinSeq: 0, encrypted: undefined, token: this.token, client: { type: "intel"} },
            this.service,
            task);
        const insightsMap = await this.document.getRoot().wait<IMap>("insights");
        const insightsMapView = await insightsMap.getView();
        return this.processIntelligenceWork(this.document, insightsMapView);
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

    private processIntelligenceWork(doc: api.Document, insightsMap: IMapView): Promise<void> {
        this.intelligenceManager = new IntelligentServicesManager(doc, insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(this.config.intelligence.textAnalytics));
        if (this.config.intelligence.nativeTextAnalytics.enable) {
            this.intelligenceManager.registerService(
                nativeTextAnalytics.factory.create(this.config.intelligence.nativeTextAnalytics));
        }
        const eventHandler = (op: ISequencedDocumentMessage, object: ICollaborativeObject) => {
            if (op.type === MessageType.Operation) {
                this.intelligenceManager.process(object);
            } else if (op.type === MessageType.Attach) {
                this.intelligenceManager.process(object);
            }
        };
        this.opHandler = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }
}
