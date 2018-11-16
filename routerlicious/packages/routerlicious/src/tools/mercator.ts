import * as commander from "commander";
import * as moniker from "moniker";
import { run } from "../utils/mercator";

// Process command line input
commander
    .version("0.0.1")
    // Using floor to work around https://github.com/tj/commander.js/issues/834
    .option("-b, --batches <batches>", "total batches", Math.floor, 10)
    .option("-z, --batchSize <batchSize>", "batch size", Math.floor, 1000)
    .option("-p, --payload <payload>", "payload size", Math.floor, 1 * 1024)
    .option("-s, --server <server>", "server url", "http://localhost:3000")
    .option("-t, --storage <server>", "storage server url", "http://localhost:3001")
    .option("-o, --tenant <tenant>", "tenant ID", "prague")
    .option("-k, --key <key>", "key", "43cfc3fbf04a97c0921fd23ff10f9e4b")
    .parse(process.argv);

console.log(`${commander.batches} batches @ ${commander.batchSize} ${commander.payload} byte messages per batch`);
const runP = run(
    moniker.choose(),
    commander.tenant,
    commander.key,
    commander.server,
    commander.storage,
    commander.batches,
    commander.batchSize,
    commander.payload);

runP.then(
    (results) => {
        console.log("");
        console.log("");
        console.log(results);
        process.exit(0);
    },
    (error) => {
        console.error(error);
    });
