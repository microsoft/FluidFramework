import * as api from "@prague/client-api";
import { IDeltaQueue } from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import * as assert from "assert";
import { BrowserErrorTrackingService } from "./errorTracking";

export class DeltaQueueManager {
    public static Unlimited = -1;

    private takeCount = DeltaQueueManager.Unlimited;

    constructor(private q: IDeltaQueue) {
        this.q.on("op", () => {
            console.log(`Take count: ${this.takeCount}`);

            // decrement take count and pause if the count drops to 0
            this.takeCount = Math.max(this.takeCount - 1, DeltaQueueManager.Unlimited);
            if (this.takeCount === 0) {
                console.log("Pausing");
                this.q.pause();
            }
        });
    }

    /**
     * Allows for the provided number of messages to be processed and then pauses the queue
     */
    public take(count: number) {
        assert(count === DeltaQueueManager.Unlimited || count > 0);

        // If the current take count is unlimited use the passed in value
        // If not unlimited then either set it to unlimited if count is unlimited or increment the count
        this.takeCount = this.takeCount === DeltaQueueManager.Unlimited
            ? count
            : count === DeltaQueueManager.Unlimited ? count : this.takeCount + count;

        this.q.resume();
    }
}

export function registerDocumentServices(config: any) {
    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new socketStorage.DefaultErrorTracking();

    const documentServices = socketStorage.createDocumentService(
        config.jarvisUrl,
        config.blobStorageUrl,
        errorService);
    api.registerDocumentService(documentServices);
}
