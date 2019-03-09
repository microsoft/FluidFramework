import { EventEmitter } from "events";
import { debug } from "./debug";

/**
 * Invokes a callback based on boolean or waits for event to fire.
 */
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
                debug(`${eventName} event fired!`);
                await callback();
                resolve();
            });
        });
    }
}

/**
 * Utility to run a forced garbage collector.
 * To expose gc, run node --expose-gc dist/paparazzi/index.js.
 */
export function runGC() {
    global.gc();
}

/**
 * Utility to print node memory usage.
 */
export function printMemoryUsage() {
    const used = process.memoryUsage();
    // tslint:disable-next-line
    for (const key in used) {
        debug(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }
}
