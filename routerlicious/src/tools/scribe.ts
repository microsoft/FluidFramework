import * as commander from "commander";
import * as fs from "fs";
import * as path from "path";
import * as ProgressBar from "progress";
import * as socketStorage from "../socket-storage";
import { scribe } from "../utils";

// Process command line input
let sharedStringId;
commander
    .version("0.0.1")
    .option("-i, --interval [interval]", "typing interval", parseFloat, 50)
    .option("-s, --server [server]", "server url", "http://localhost:3000")
    .option("-t, --storage [server]", "storage server url", "http://localhost:3001")
    .option("-r, --repository [repo]", "git repository", "prague")
    .option("-f, --file [file]", "input file", path.join(__dirname, "../../public/literature/pp.txt"))
    .arguments("<id>")
    .action((id: string) => {
        sharedStringId = id;
    })
    .parse(process.argv);

if (!sharedStringId) {
    commander.help();
}

// Mark socket storage as our default provider
socketStorage.registerAsDefault(commander.server, commander.storage, commander.repository);

fs.readFile(commander.file, "utf8", async (error, data: string) => {
    if (error) {
        console.error(error);
        process.exit(1);
    }

    console.log(`${commander.server}/sharedText/${sharedStringId}`);

    // Start typing and register to update the UI
    const bar = new ProgressBar(
        // tslint:disable-next-line:max-line-length
        "[:bar] :current/:total; Typing: :typingRate char/s; Ack: :ackRate char/s; Latency: :latency ms, StdDev :stdDev ms",
        {
            complete: "=",
            incomplete: " ",
            total: data.length,
        });
    await scribe.create(sharedStringId);
    const typeP = scribe.type(
        commander.interval,
        data,
        (metrics) => {
            bar.update(metrics.ackProgress, {
                ackRate: (metrics.ackRate ? metrics.ackRate : 0).toFixed(2),
                latency: (metrics.latencyAverage ? metrics.latencyAverage : 0).toFixed(2),
                stdDev: (metrics.latencyStdDev ? metrics.latencyStdDev : 0).toFixed(2),
                typingRate: (metrics.typingRate ? metrics.typingRate : 0).toFixed(2),
            });
        });

    // Output the total time once typing is finished
    typeP.then(
        (time) => {
            console.log(`Done: ${time} ms`);
            process.exit(0);
        },
        (typingError) => {
            console.error(error);
            process.exit(1);
        });
});
