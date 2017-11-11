/*
import { IMapView } from "prague/data-types";

class OrderedGraph{

}

class OrderedGraphCollection {
    rootView: IMapView;
    ographs: OrderedGraph[];
    constructor(public doc: prague.api.Document) {
    }

    async initialize() {
        this.rootView = await this.doc.getRoot().getView();
        if (!this.rootView.has("graphs")) {
            this.rootView.set("graphs", this.doc.createMap());
        }
    }
}
*/