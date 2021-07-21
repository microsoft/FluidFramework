import { ITelemetryLogger } from "@fluidframework/common-definitions";

export class ThresholdTelemetrySender {
    public constructor(
        private readonly threshold: number,
        private readonly logger: ITelemetryLogger,
    ) {}

    public send(event: string, value?: number) {
        this.sendInternal(event, value);
    }

    public sendIfMultiple(event: string, value?: number) {
        this.sendInternal(event, value, 0);
    }

    private sendInternal(event: string, value?: number, delta?: number) {
        if (value === undefined || value < this.threshold) {
            return;
        }

        if (delta === undefined || value % this.threshold === delta) {
            this.logger.sendPerformanceEvent({
                eventName: event,
                count: value,
            });
        }
    }
}
