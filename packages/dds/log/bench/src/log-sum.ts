import { consume, createLog } from "./util";
import { benchmark, getTestArgs } from "hotloop";

const { count } = getTestArgs();

const log = createLog<number>();
for (let i = 0; i < count; i++) {
    log.appendEntry(i);
}

benchmark(`Log Sum (count=${count})`, () => {
    let sum = 0;

    for (let i = 0; i < count; i++) {
        sum += log.getEntry(i);
    }

    consume(sum);
});
