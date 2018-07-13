import { EventEmitter } from "events";

export async function runAfterWait(
    dirty: boolean,
    eventSource: EventEmitter,
    eventName: string,
    callback: () => Promise<void>) {
    if (!dirty) {
        await callback();
    } else {
        return new Promise<void>((resolve, reject) => {
            eventSource.on(eventName, async () => {
                console.log(`${eventName} event fired!`);
                await callback();
                resolve();
            });
        });
    }
}
