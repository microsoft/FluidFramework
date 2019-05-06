import { ContainerRuntime } from "@prague/container-runtime";
import { Snapshotter } from "./snapshotter";

export function run(runtime: ContainerRuntime) {
    const snapshotter = new Snapshotter(runtime);
    snapshotter.start();
}
