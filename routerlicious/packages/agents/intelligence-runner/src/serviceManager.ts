import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { IIntelligentService } from "./analytics";
import { RateLimiter } from "./rateLimiter";

// 10s wait time between intelligent service calls
const defaultWaitTime = 10 * 1000;

export class IntelligentServicesManager {
    private services: IIntelligentService[] = [];
    private rateLimiter: RateLimiter;
    private intelInvoked: boolean = false;

    constructor(private sharedString: Sequence.SharedString, private documentInsights: ISharedMap) {}

    /**
     * Registers a new intelligent service
     */
    public registerService(service: IIntelligentService) {
        this.services.push(service);
    }

    public process() {
        this.sharedString.on("op", (msg: ISequencedDocumentMessage) => {
            if (!this.intelInvoked) {

                // And then run plugin insights rate limited
                this.rateLimiter = new RateLimiter(
                    async () => {
                        const output = this.documentInsights.get(this.sharedString.id) as ISharedMap;

                        // Run the shared services
                        const text = this.sharedString.client.getText();
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
        });
    }
}
