import { api, core, types } from "../client-api";
import { nativeTextAnalytics, textAnalytics } from "../intelligence";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";
import { IntelligentServicesManager } from "./intelligence";

export class IntelWork extends BaseWork implements IWork {

    private intelligenceManager: IntelligentServicesManager;

    constructor(docId: string, private token: string, config: any, private service: core.IDocumentService) {
        super(docId, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { localMinSeq: 0, encrypted: undefined, token: this.token, client: { type: "intel"} },
            this.service,
            task);
        const root = await this.document.getRoot().getView();
        if (!root.has("insights")) {
            root.set("insights", this.document.createMap());
        }
        const insightsMap = root.get("insights") as types.IMap;
        const insightsMapView = await insightsMap.getView();
        return this.processIntelligenceWork(this.document, insightsMapView);
    }

    public async stop(task: string): Promise<void> {
        if (this.intelligenceManager) {
            await this.intelligenceManager.stop();
        }
        await super.stop(task);
    }

    public registerNewService(service: any) {
        this.intelligenceManager.registerService(service.factory.create(this.config.intelligence.resume));
    }

    private processIntelligenceWork(doc: api.Document, insightsMap: types.IMapView): Promise<void> {
        this.intelligenceManager = new IntelligentServicesManager(doc, insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(this.config.intelligence.textAnalytics));
        if (this.config.intelligence.nativeTextAnalytics.enable) {
            this.intelligenceManager.registerService(
                nativeTextAnalytics.factory.create(this.config.intelligence.nativeTextAnalytics));
        }
        const eventHandler = (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (op.type === core.ObjectOperation) {
                this.intelligenceManager.process(object);
            } else if (op.type === core.AttachObject) {
                this.intelligenceManager.process(object);
            }
        };
        this.opHandler = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }
}
