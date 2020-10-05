import { consume, createLog } from "./util";
import { benchmark } from "hotloop";

const log = createLog<number>();
for (let i = 0; i < (256 * 256); i++) {
    log.appendEntry(i);
}

benchmark("", async () => {
    let sum = 0;

    for (let i = 0; i < (256 * 256); i++) {
        sum += await log.getEntry(i);
    }

    consume(sum);
});
