import * as api from "../api";
import * as intelligence from "../intelligence";
import * as mergeTree from "../merge-tree";
import * as shared from "./";

// 5s wait time between intelligent service calls
const defaultWaitTime = 20 * 1000;

export class IntelligentServicesManager {
    private services: intelligence.IIntelligentService[] = [];
    private rateLimiter: shared.RateLimiter;
    private intelInvoked: boolean = false;

    constructor(
        private doc: api.Document,
        private documentInsights: api.IMapView) {}

    /**
     * Registers a new intelligent service
     */
    public registerService(service: intelligence.IIntelligentService) {
        this.services.push(service);
    }

    public process(object: api.ICollaborativeObject) {
        // TODO expose way for intelligent services to express their supported document types
        if (object.type === mergeTree.CollaboritiveStringExtension.Type) {
            if (!this.intelInvoked) {
                const sharedString = object as mergeTree.SharedString;

                // And then run plugin insights rate limited
                this.rateLimiter = new shared.RateLimiter(
                    async () => {
                        // Create a map for the object if it doesn't exist yet
                        if (!this.documentInsights.has(object.id)) {
                            this.documentInsights.set(object.id, this.doc.createMap());
                        }

                        const output = this.documentInsights.get(object.id) as api.IMap;

                        // Run the collaborative services
                        const text = sharedString.client.getText();
                        const setInsightsP = this.services.map(async (service) => {
                            const result = await service.run(text);
                            return output.set(service.name, result);
                        });
                        return Promise.all(setInsightsP);
                    },
                    defaultWaitTime);
                this.intelInvoked = true;
            }
            this.rateLimiter.trigger();
        }
    }
}
