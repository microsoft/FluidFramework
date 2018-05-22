import * as augLoop from "./launcher";

async function run(): Promise<void> {
    augLoop.launch();
}

run().catch((error) => {
    console.error(error);
});
