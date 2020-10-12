import { consume } from "./util";
import { benchmarkPromise, getTestArgs } from "hotloop";

const { count } = getTestArgs();

const log: number[] = [];
for (let i = 0; i < count; i++) {
    log.push(i);
}

benchmarkPromise(`Array Sum (count=${count})`, async () => {
    let sum = 0;

    for (let i = 0; i < count; i++) {
        sum += log[i];
    }

    consume(sum);
});
