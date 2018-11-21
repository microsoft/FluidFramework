import * as pragueMap from "@prague/map";
import { debug, debugDOM, debugFrame } from "./debug";
import { PragueMapViewWrapper } from "./pragueMapWrapper";
import { IFrameLoader, StreamDOMTreeClient, StreamWindowClient } from "./streamDOMTreeClient";

type FrameRecord = { frame: HTMLIFrameElement, loadingFrame: Promise<StreamWindowClient> }; // tslint:disable-line

type LoadResult = { // tslint:disable-line
    readonly frameLoader: FrameLoader;
    readonly streamWindowReceiver: StreamWindowClient;
};

export interface IFrameLoaderCallbacks {
    onDOMDataNotFound();
    onDOMDataFound(startLoadTime: Date, dataView: pragueMap.IMapView);
    onTreeGenerated(tree: StreamDOMTreeClient);
    onValueChanged(key: string): boolean;

    getScrollPosField(): HTMLSpanElement;
    getViewScale(): number;

    onDimensionUpdated(dimension: any, scaleStr: string, boundingRect: any, viewScaleValue: number);
}

export class FrameLoader implements IFrameLoader {
    public static async syncRoot(
        frame: HTMLIFrameElement, rootView: pragueMap.IMapView, callbacks?: IFrameLoaderCallbacks) {

        let loadResultPromise: Promise<LoadResult>;
        const dataName = "DOMSTREAM";
        rootView.getMap().on("valueChanged", (changed, local, op) => {
            if (changed.key === dataName) {
                debug("Loading new page");
                loadResultPromise.then((loadResult) => {
                    if (loadResult) {
                        loadResult.streamWindowReceiver.stopSync();
                        loadResult.frameLoader.stopSync();
                    }
                    loadResultPromise = FrameLoader.loadRoot(frame, rootView, dataName, callbacks);
                });
            }
        });

        loadResultPromise = FrameLoader.loadRoot(frame, rootView, dataName, callbacks);
    }

    public static setDimension(
        frame: HTMLIFrameElement, dataMapView: pragueMap.IMapView, callbacks: IFrameLoaderCallbacks) {

        const dimension = JSON.parse(dataMapView.get("DIMENSION"));
        debugDOM(dimension);
        if (dimension) {
            const viewScaleValue = callbacks ? callbacks.getViewScale() : 100;
            frame.width = dimension.width;
            frame.height = dimension.height;

            const scaleStr = dimension.devicePixelRatio === 1 ? "" :
                " scale(" + (dimension.devicePixelRatio * 100).toFixed(0) + ")";

            if (dimension.devicePixelRatio === 1 && viewScaleValue === 100) {
                frame.style.transform = "";
                frame.style.transformOrigin = "";
            } else {
                frame.style.transform = "scale(" + (viewScaleValue / 100 * dimension.devicePixelRatio) + ")";
                frame.style.transformOrigin = "top left";
            }

            // Also update the scroll pos after resize.
            const scrollPosField = callbacks ? callbacks.getScrollPosField() : undefined;
            StreamWindowClient.loadScrollPos(frame.contentWindow, dataMapView.get("SCROLLPOS"), scrollPosField);

            if (callbacks) {
                const boundingRect = frame.getBoundingClientRect();
                callbacks.onDimensionUpdated(dimension, scaleStr, boundingRect, viewScaleValue);
            }
        }
    }

    private static async loadRoot(
        frame: HTMLIFrameElement, rootView: pragueMap.IMapView, dataName: string, callbacks: IFrameLoaderCallbacks) {

        const dataMap = rootView.get(dataName);
        if (!dataMap) {
            if (callbacks) {
                callbacks.onDOMDataNotFound();
            }
            return;
        }

        const startLoadTime = new Date();
        const dataMapView = await dataMap.getView();
        if (callbacks) {
            callbacks.onDOMDataFound(startLoadTime, dataMapView);
        }
        FrameLoader.setDimension(frame, dataMapView, callbacks);
        const frameLoader = new FrameLoader(dataMapView);
        const tree = await frameLoader.streamDOMFromPrague(dataMapView, frame.contentDocument);
        if (!tree) {
            return;
        }

        if (callbacks) {
            callbacks.onTreeGenerated(tree);
        }

        const w = frame.contentWindow;
        dataMapView.getMap().on("valueChanged", (changed, local, op) => {
            if (callbacks && callbacks.onValueChanged(changed.key)) {
                return;
            }
            switch (changed.key) {
                case "DIMENSION":
                    FrameLoader.setDimension(frame, dataMapView, callbacks);
                    break;

                // Ignoreable changes
                case "DATE":
                case "END_DATE":
                case "TIME_ATTACH":

                // These are dealt with in the StreamWindow
                case "SCROLLPOS":
                case "REMOTECLICK":
                case "MUTATION":
                case "MUTATION_DATE":
                    break;

                default:
                    if (!frameLoader.reloadFrameWithDataName(changed.key)) {
                        if (dataMapView.has(changed.key)) {
                            console.error(changed.key, "shouldn't change");
                        }
                    }
                    break;
            }
        });

        const scrollPosField = callbacks ? callbacks.getScrollPosField() : undefined;
        StreamWindowClient.loadScrollPos(w, dataMapView.get("SCROLLPOS"), scrollPosField);

        const mapViewWrapper = new PragueMapViewWrapper(dataMapView);
        const streamWindowReceiver = new StreamWindowClient(w, mapViewWrapper, tree, scrollPosField);
        return { frameLoader, streamWindowReceiver };
    }

    // TODO: How to clean this map?
    private frameStreamWindowMap = new Map<string, FrameRecord>();
    private frameToNameMap = new WeakMap<HTMLIFrameElement, string>();
    private frameDataContainer: pragueMap.IMapView;

    constructor(frameDataContainer: pragueMap.IMapView) {
        this.frameDataContainer = frameDataContainer;
    }

    public loadFrame(frame: HTMLIFrameElement, frameId: number) {
        const dataName = "DOMSTREAM_" + frameId;
        this.frameStreamWindowMap.set(dataName, { frame, loadingFrame: this.loadFrameData(dataName, frame) });
        this.frameToNameMap.set(frame, dataName);
    }

    public reloadFrame(frame: HTMLIFrameElement, frameId: number) {
        const oldName = this.frameToNameMap.get(frame);
        if (oldName) {
            const data = this.frameStreamWindowMap.get(oldName);
            if (data) {
                // iframe navigated, load new data.
                data.loadingFrame.then((streamWindow) => {
                    if (streamWindow) {
                        streamWindow.stopSync();
                    }
                    this.loadFrame(frame, frameId);
                });
                return;
            }
        }
        this.loadFrame(frame, frameId);
    }

    private reloadFrameWithDataName(dataName: string) {
        debugFrame(-1, "Reloading frame data", dataName);
        const data = this.frameStreamWindowMap.get(dataName);
        if (data) {
            // iframe navigated, load new data.
            data.loadingFrame.then((streamWindow) => {
                if (streamWindow) {
                    streamWindow.stopSync();
                }
                this.loadFrameData(dataName, data.frame);
            });

            return true;
        }
        return false;
    }

    private async streamDOMFromPrague(dataMapView: pragueMap.IMapView, doc: Document) {
        const domMap: pragueMap.IMap = dataMapView.get("DOM");
        if (!domMap) {
            return;
        }
        const domMapView = await domMap.getView();
        if (!dataMapView.has("DOMFLATMAPNODE")) { return; }
        const domRootNode = dataMapView.get("DOMFLATMAPNODE");

        const tree = new StreamDOMTreeClient(this);
        await tree.readFromMap(new PragueMapViewWrapper(domMapView), domRootNode, doc);
        return tree;
    }

    private stopSync() {
        for (const item of this.frameStreamWindowMap) {
            item[1].loadingFrame.then((streamWindow) => {
                if (streamWindow) {
                    streamWindow.stopSync();
                }
            });
        }
        this.frameStreamWindowMap = null;
        this.frameToNameMap = null;
    }
    private async loadFrameData(dataName: string, frame: HTMLIFrameElement) {
        const frameDataMap = this.frameDataContainer.get(dataName);
        if (frameDataMap) {
            const subDataMapView = await frameDataMap.getView();
            const subtree = await this.streamDOMFromPrague(subDataMapView, frame.contentDocument);
            if (subtree) {
                const mapViewWrapper = new PragueMapViewWrapper(subDataMapView);
                return new StreamWindowClient(frame.contentWindow, mapViewWrapper, subtree);
            }
        }
    }
}
