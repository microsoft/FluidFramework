import { Runtime } from "@prague/runtime";
import { Snapshotter } from "./snapshotter";

export function run(runtime: Runtime) {
    const snapshotter = new Snapshotter(runtime);
    snapshotter.start();
}
