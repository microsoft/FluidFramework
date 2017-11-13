import { api, core, MergeTree, types } from "../client-api";
import * as intelligence from "../intelligence";
import { RateLimiter } from "./rateLimiter";

// 5s wait time between intelligent service calls
const defaultWaitTime = 20 * 1000;

export class IntelligentServicesManager {
    private services: intelligence.IIntelligentService[] = [];
    private rateLimiter: RateLimiter;
    private intelInvoked: boolean = false;

    constructor(
        private doc: api.Document,
        private documentInsights: types.IMapView) {}

    /**
     * Registers a new intelligent service
     */
    public registerService(service: intelligence.IIntelligentService) {
        this.services.push(service);
    }

    public process(object: core.ICollaborativeObject) {
        // TODO expose way for intelligent services to express their supported document types
        if (object.type === MergeTree.CollaboritiveStringExtension.Type) {
            if (!this.intelInvoked) {
                const sharedString = object as MergeTree.SharedString;

                // And then run plugin insights rate limited
                this.rateLimiter = new RateLimiter(
                    async () => {
                        // Create a map for the object if it doesn't exist yet
                        if (!this.documentInsights.has(object.id)) {
                            this.documentInsights.set(object.id, this.doc.createMap());
                        }

                        const output = this.documentInsights.get(object.id) as types.IMap;

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
