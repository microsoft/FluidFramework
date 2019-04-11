export let dumpMessages = false;
export let dumpMessageStats = false;
export let dumpChannelStats = false;
export let dumpDataTypeStats = false;
export let dumpSnapshotStats = false;
export let dumpSnapshotTrees = false;
export let dumpSnapshotBlobs = false;
export let dumpSnapshotVersions = false;
export let dumpTotalStats = false;
export let dumpSnapshotSha = false;
export let paramSnapshotVersionIndex: number | undefined;
export let paramNumSnapshotVersions = 10;

export let paramSave: string| undefined;
export const messageTypeFilter = new Set<string>();

export let paramURL: string | undefined;
export let paramJWT: string;

const optionsArray =
    [
        ["--dump:rawmessage", "dump all messages"],
        ["--dump:snapshotVersion", "dump a list of snapshot version"],
        ["--dump:snapshotTree", "dump the snapshot trees"],
        ["--dump:snapshotBlob", "dump the contents of snapshot blobs"],
        ["--dump:snapshotSha", "dump a table of snapshot path and blob's sha"],
        ["--stat:message", "show a table of message type counts and size"],
        ["--stat:snapshot", "show a table of snapshot path and blob size"],
        ["--stat:dataType", "show a table of data type"],
        ["--stat:channel", "show a table of channel"],
        ["--filter:messageType <type>", "filter message by <type>"],
        ["--jwt <token>", "token to be used for routerlicious URLs"],
        ["--numSnapshotVersions <number>", "Number of versions to load (default:10)"],
        ["--snapshotVersionIndex <number>", "Index of the version to dump"],
        ["--saveDir <outdir>", "Save data of the snapshots and messages"],
    ];

export function printUsage() {
    console.log("Usage: pragueDump [options] URL");
    console.log("URL: <ODSP joinSession URL>|<Routerlicious URL>");
    console.log("Options:");
    for (const i of optionsArray) {
        console.log(`  ${i[0].padEnd(32)}: ${i[1]}`);
    }
}

export function parseArguments() {
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        switch (arg) {
            case "--dump:rawmessage":
                dumpMessages = true;
                break;
            case "--stat:message":
                dumpMessageStats = true;
                break;
            case "--stat:channel":
                dumpChannelStats = true;
                break;
            case "--stat:dataType":
                dumpDataTypeStats = true;
                break;
            case "--stat":
                dumpTotalStats = true;
                break;
            case "--filter:messageType":
                messageTypeFilter.add(parseStrArg(i++, "type name for messageType filter"));
                break;
            case "--stat:snapshot":
                dumpSnapshotStats = true;
                break;
            case "--dump:snapshotVersion":
                dumpSnapshotVersions = true;
                break;
            case "--dump:snapshotTree":
                dumpSnapshotTrees = true;
                break;
            case "--dump:snapshotBlob":
                dumpSnapshotBlobs = true;
                break;
            case "--dump:snapshotSha":
                dumpSnapshotSha = true;
                break;
            case "--help":
                printUsage();
                process.exit(0);
            case "--jwt":
                paramJWT = parseStrArg(i++, "jwt token");
                break;
            case "--snapshotVersionIndex":
                paramSnapshotVersionIndex = parseIntArg(i++, "version index");
                break;
            case "--numSnapshotVersions":
                paramNumSnapshotVersions = parseIntArg(i++, "number of versions");
                break;
            case "--saveDir":
                paramSave = parseStrArg(i++, "save data path");
                break;
            default:
                try {
                    const url = new URL(arg);
                    if (url.protocol === "https:") {
                        paramURL = arg;
                        break;
                    }
                } catch (e) {
                    // Nothing
                }

                console.error(`ERROR: Invalid argument ${arg}`);
                printUsage();
                process.exit(-1);
                break;
        }
    }
    checkArgs();
}

function parseStrArg(i: number, name: string) {
    if (i + 1 >= process.argv.length) {
        console.error(`ERROR: Missing ${name}`);
        printUsage();
        process.exit(-1);
    }
    return process.argv[i + 1];
}
function parseIntArg(i: number, name: string) {
    if (i + 1 >= process.argv.length) {
        console.error(`ERROR: Missing ${name}`);
        printUsage();
        process.exit(-1);
    }
    const numStr = process.argv[i + 1];
    const paramNumber = parseInt(numStr, 10);
    if (isNaN(paramNumber) || paramNumber <= 0) {
        console.error(`ERROR: Invalid ${name} ${numStr}`);
        printUsage();
        process.exit(-1);
    }
    return paramNumber;
}

function checkArgs() {
    if (paramSnapshotVersionIndex !== undefined) {
        paramNumSnapshotVersions = Math.max(paramSnapshotVersionIndex + 1, paramNumSnapshotVersions);
    }
}
