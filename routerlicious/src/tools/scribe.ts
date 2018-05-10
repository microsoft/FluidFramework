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
    .option("-i, --interval [interval]", "typing interval", parseFloat, 5)
    .option("-s, --server [server]", "server url", "http://localhost:3000")
    .option("-t, --storage [server]", "storage server url", "http://localhost:3001")
    .option("-o, --tenant [id]", "tenant ID", "git")
    .option("-f, --file [file]", "input file", path.join(__dirname, "../../public/literature/resume.txt"))
    .option("-b, --progress [pbar]", "show progress bar")
    .option("-w, --write [write]", "write to specific path", "./latest-scribe.json")
    .option("-p, --processes [processes]", "processes to write with", 1)
    .option("-a, --authors [authors]", "Total authors to write with", 1)
    .arguments("<id>")
    .action((id: string) => {
        sharedStringId = id;
    })
    .parse(process.argv);

if (!sharedStringId) {
    commander.help();
}

// Mark socket storage as our default provider
socketStorage.registerAsDefault(commander.server, commander.storage, commander.tenantId);

fs.readFile(commander.file, "utf8", async (error, data: string) => {
    if (error) {
        console.error(error);
        process.exit(1);
    }

    let bar: ProgressBar;

    let debug = false;
    if (commander.progress) {
        debug = true;
        // Start typing and register to update the UI
        bar = new ProgressBar(
            // tslint:disable-next-line:max-line-length
            "[:bar] :current/:total; Typing: :typingRate char/s; Ack: :ackRate char/s; Latency: :latency ms, StdDev :stdDev ms",
            {
                complete: "=",
                incomplete: " ",
                total: data.length,
            });
    }

    // TODO - replace null token parameter with generated token
    await scribe.create(sharedStringId, null, data, debug);
    scribe.togglePlay();

    setTimeout(() => {
        let lastReported = 0;

        // TODO - replace null token parameter with generated metrics document token
        const typeP = scribe.type(
            commander.interval,
            data,
            Number(commander.authors),
            Number(commander.processes),
            null,
            (metrics) => {
                if (commander.progress) {
                    bar.update(metrics.ackProgress, {
                        ackRate: (metrics.ackRate ? metrics.ackRate : 0).toFixed(2),
                        latency: (metrics.latencyAverage ? metrics.latencyAverage : 0).toFixed(2),
                        stdDev: (metrics.latencyStdDev ? metrics.latencyStdDev : 0).toFixed(2),
                        typingRate: (metrics.typingRate ? metrics.typingRate : 0).toFixed(2),
                    });
                } else {
                    let progress = Math.round(metrics.typingProgress * 100);
                    if (progress > lastReported) {
                        console.log(progress + "% Completed");
                        lastReported = progress;
                    }
                }
          });

        // Output the total time once typing is finished
        typeP.then(
            (metrics) => {
                const metricString = JSON.stringify(metrics);
                ensurePath(commander.write);
                // write to file so output isn't affected by downstream stdout
                fs.writeFile(commander.write, metricString, (err) => {
                    if (err) {
                        console.log(err);
                        process.exit(1);
                    }
                    process.exit(0);
                });
            },
            (typingError) => {
                console.error(error);
                process.exit(1);
            });
    }, 1000);

});

function ensurePath(filePath: string) {
    let dir = path.dirname(filePath);
    if (fs.existsSync(dir)) {
        return true;
    }
    ensurePath(dir);
    fs.mkdirSync(dir);
}
