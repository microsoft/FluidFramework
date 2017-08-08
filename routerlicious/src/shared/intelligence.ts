import * as api from "../api";
import * as intelligence from "../intelligence";
import * as mergeTree from "../merge-tree";

// 5s wait time between intelligent service calls
const defaultWaitTime = 5 * 1000;

/**
 * The rate limiter is a simple class that will defer running an async action
 */
export class RateLimiter {
    private pending = false;
    private dirty = false;

    constructor(private action: () => Promise<any>, private rate: number) {
    }

    public trigger() {
        // TODO having an idle time might be good so that we run an insight immediately when a document/object
        // coalesces
        // I might want to have an idle time combined with a max wait time

        // If we have a pending operation in flight or a timer in play to limit the rate simply mark
        // that another update has come in
        if (this.pending) {
            this.dirty = true;
            return;
        }

        // Mark ourselves pending and clear the dirty flag
        this.dirty = false;
        this.pending = true;

        // No pending and it's been at least the given amount of time between action
        const completeP = this.action().catch((error) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait).
            if (error) {
                console.error(error);
            }
        });

        // Finally clause to start snapshotting again once we finish
        completeP.then(() => {
            // Wait rate amount of time before resolving to limit the udpate flow
            setTimeout(() => {
                this.pending = false;
                if (this.dirty) {
                    this.trigger();
                }
            }, this.rate);
        });
    }
}

export class IntelligentServicesManager {
    private services: intelligence.IIntelligentService[] = [];
    private trackedDocuments: { [id: string]: RateLimiter } = {};

    constructor(private doc: api.Document, private documentInsights: api.IMapView) {
    }

    /**
     * Registers a new intelligent service
     */
    public registerService(service: intelligence.IIntelligentService) {
        this.services.push(service);
    }

    public process(object: api.ICollaborativeObject) {
        // TODO expose way for intelligent services to express their supported document types
        if (object.type === mergeTree.CollaboritiveStringExtension.Type) {
            if (!(object.id in this.trackedDocuments)) {
                const sharedString = object as mergeTree.SharedString;

                this.trackedDocuments[object.id] = new RateLimiter(
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
            }

            this.trackedDocuments[object.id].trigger();
        }
    }
}
