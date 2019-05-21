import { playMessagesFromFileStorage } from "./replayMessages";
import { initializeFileDocumentService } from "./replayToolInit";

export let replayTool: ReplayTool;

const optionsArray =
    [
        ["--filename", "Name of file containing ops"],
        ["--from", "Play ops from --from"],
        ["--to", "Play ops upto --to"],
        ["--snapshot", "Add this to take snapshot after all the ops are replayed"],
        ["--snapfreq", "Specify frequency so as to take a snapshot after every --snapfreq op"],
    ];

export class ReplayTool {

    public fileName: string;
    public from: number = 0;
    public to: number = -1;
    public cd;
    public takeSnapshot = false;
    public snapFreq: number;

    constructor() {
        this.parseArguments();
    }

    public parseArguments() {
        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];
            switch (arg) {
                case "--filename":
                    i += 1;
                    this.fileName = this.parseStrArg(i, "File name");
                    break;
                case "--from":
                    i += 1;
                    this.from = this.parseIntArg(i, "From");
                    break;
                case "--to":
                    i += 1;
                    this.to = this.parseIntArg(i, "To");
                    break;
                case "--snapshot":
                    this.takeSnapshot = true;
                    break;
                case "--snapfreq":
                    i += 1;
                    this.snapFreq = this.parseIntArg(i, "Snapshot Frequency");
                    break;
                default:
                    console.error(`ERROR: Invalid argument ${arg}`);
                    this.printUsage();
                    process.exit(-1);
            }
        }
    }

    public parseStrArg(i: number, name: string) {
        if (i >= process.argv.length) {
            console.error(`ERROR: Missing ${name}`);
            this.printUsage();
            process.exit(-1);
        }
        return process.argv[i];
    }

    public parseIntArg(i: number, name: string) {
        if (i >= process.argv.length) {
            console.error(`ERROR: Missing ${name}`);
            this.printUsage();
            process.exit(-1);
        }
        const numStr = process.argv[i];
        const paramNumber = parseInt(numStr, 10);
        if (isNaN(paramNumber) || paramNumber < 0) {
            console.error(`ERROR: Invalid ${name} ${numStr}`);
            this.printUsage();
            process.exit(-1);
        }
        return paramNumber;
    }

    public printUsage() {
        console.log("Usage: replayTool [options]");
        console.log("Options:");
        for (const i of optionsArray) {
            console.log(`  ${i[0].padEnd(32)}: ${i[1]}`);
        }
    }
}

async function replayToolMain() {
    replayTool = new ReplayTool();
    const documentServiceFactory = await initializeFileDocumentService(
        replayTool.fileName,
        replayTool.from,
        replayTool.to);
    await playMessagesFromFileStorage(replayTool, documentServiceFactory);
    while (true) {
        await delay(2000);
    }
}

function delay(ms: number) {
    // tslint:disable-next-line: no-string-based-set-timeout
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

replayToolMain()
    .catch((error: string) => console.log(`ERROR: ${error}`))
    .finally(() => {
        process.exit(0);
    });
