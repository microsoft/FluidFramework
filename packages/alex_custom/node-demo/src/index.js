import { NewSharedMap } from "@fluidframework/new-map";
import { SharedMap } from "@fluidframework/map";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

const client = new TinyliciousClient();

async function runTest() {

    const { container } = await client.createContainer({
        initialObjects: {
            currentMap: SharedMap,
            newMap: NewSharedMap
        }
    });
    const maps = container.initialObjects;
    await container.attach();

    maps.currentMap.set("a", 1);
    maps.newMap.set("a", 1);

    const results = {};
    const targetIterations = [100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000];
    targetIterations.forEach(target => {
        console.log(`Executing .get() ${target} times`);
        results[target] = {};

        let start = Date.now();
        for (let i = 0; i < target; i++) {
            maps.currentMap.get('a');
        }
        results[target].current = Date.now() - start;

        start = Date.now();
        for (let i = 0; i < target; i++) {
            maps.newMap.get('a');
        }
        results[target].new = Date.now() - start;
    });

    printResults(results);
}

function printResults(results) {
    console.log();
    const separator = "|----------|------------|--------|-----------|";
    console.log(separator);
    console.log(`|Iterations|Current (ms)|New (ms)|Improvement|`)
    console.log(separator);
    Object.keys(results).forEach(k => {
        const improvement = (results[k].current - results[k].new)/results[k].current * 100;
        const line = `|${k.padStart(10, ' ')}|` +
                     `${results[k].current.toString().padStart(12, ' ')}|` +
                     `${results[k].new.toString().padStart(8, ' ')}|` +
                     `${Math.round(improvement * 100)/100}%`.padStart(11, ' ') + "|";
        console.log(line);
        console.log(separator);
    });
}
runTest().catch(console.error());
