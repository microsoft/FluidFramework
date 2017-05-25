import * as api from "../api";
import * as intelligence from "../intelligence";
import * as mergeTree from "../merge-tree";

// 15s wait time between intelligent service calls
const defaultWaitTime = 15 * 1000;

/**
 * The rate limiter is a simple class that will defer running an async action
 */
class RateLimiter {
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

    constructor(private collaborationServices: api.ICollaborationServices) {
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

                const extension = api.defaultRegistry.getExtension(api.MapExtension.Type);
                const insights = extension.load(
                    `${object.id}-insights`,
                    this.collaborationServices,
                    api.defaultRegistry) as api.IMap;

                this.trackedDocuments[object.id] = new RateLimiter(
                    async () => {
                        // Run the collaborative services
                        const text = sharedString.client.getText();
                        const results = await Promise.all(this.services.map((service) => service.run(text)));

                        // And then store the output values in the map
                        const storedP = [];
                        for (let i = 0; i < this.services.length; i++) {
                            storedP.push(insights.set(this.services[i].name, results[i]));
                        }

                        return Promise.all(storedP);
                    },
                    defaultWaitTime);
            }

            this.trackedDocuments[object.id].trigger();
        }
    }
}
