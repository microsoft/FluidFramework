// A rate limiter to make sure that a client can only request help for one task within a time window.
export class RateLimitter {
    private readonly requestMap = new Map<string, number>();

    constructor(private readonly windowMSec: number) {

    }

    public filter(clientId: string, messages: string[]): string[] {
        const approvedList: string[] = [];
        const currentTime = Date.now();

        for (const message of messages) {
            const key = `${clientId}/${message}`;
            if (!this.requestMap.has(key)) {
                this.requestMap.set(key, currentTime);
                approvedList.push(message);
            } else if (this.requestMap.get(key)! + this.windowMSec > currentTime) {
                continue;
            } else {
                this.requestMap.set(key, currentTime);
                approvedList.push(message);
            }
        }

        return approvedList;
    }
}
