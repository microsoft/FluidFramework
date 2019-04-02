export let dumpMessages = false;
export let dumpMessageStats = false;
export let dumpChannelStats = false;
export let dumpDataTypeStats = false;
export let dumpSnapshotStats = false;
export let dumpSnapshotTrees = false;
export let dumpSnapshotBlobs = false;
export let dumpTotalStats = false;
export let dumpSnapshotSha = false;
export const messageTypeFilter = new Set<string>();

export let paramURL: string | undefined;
export let paramJWT: string;

const optionsArray =
    [
        ["--dump:rawmessage", "dump all messages"],
        ["--dump:snapshotTree", "dump the snapshot trees"],
        ["--dump:snapshotBlob", "dump the contents of snapshot blobs"],
        ["--dump:snapshotSha", "dump a table of snapshot path and blob's sha"],
        ["--stat:message", "show a table of message type counts and size"],
        ["--stat:snapshot", "show a table of snapshot path and blob size"],
        ["--stat:dataType", "show a table of data type"],
        ["--stat:channel", "show a table of channel"],
        ["--filter:messageType <type>", "filter message by <type>"],
        ["--jwt <token>", "token to be used for routerlicious URLs"],
    ];

export function printUsage() {
    console.log("Usage: pragueDump [options] URL");
    console.log("URL: <ODSP joinSession URL>|<Routerlicious URL>");
    console.log("Options:");
    for (const i of optionsArray) {
        console.log(`  ${i[0].padEnd(30)}: ${i[1]}`);
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
                if (i + 1 >= process.argv.length) {
                    console.error("ERROR: Missing type name for messageType filter");
                    process.exit(-1);
                }
                messageTypeFilter.add(process.argv[++i]);
                break;
            case "--stat:snapshot":
                dumpSnapshotStats = true;
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
                if (i + 1 >= process.argv.length) {
                    console.error("ERROR: Missing jwt token");
                    process.exit(-1);
                }
                paramJWT = process.argv[++i];
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
}
