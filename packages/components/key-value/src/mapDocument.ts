import { Component } from "@prague/app-component";
import {
    MapExtension,
} from "@prague/map";

export abstract class MapDocument extends Component {
    constructor() {
        // Create and register map extension
        const mapExtension = new MapExtension();
        super([
            [mapExtension.type, mapExtension],
        ]);
    }
}
