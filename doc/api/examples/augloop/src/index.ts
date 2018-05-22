import * as winston from "winston";
import * as augLoop from "./launcher";

async function run(): Promise<void> {
    augLoop.launch();
}

run().catch((error) => {
    winston.error(error);
});
