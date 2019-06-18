/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as pragueLoader from "@prague/loader";
import * as loaderWeb from "@prague/loader-web";
import { IMapView } from "@prague/map";
import { IChaincode, IDocumentService, IPlatform, IRuntime } from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import { Deferred } from "@prague/utils";
import { EventEmitter } from "events";
import * as GoogleMaps from "google-maps";
import * as jwt from "jsonwebtoken";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import { WebPlatformFactory } from "./webPlatform";

// tslint:disable-next-line
const GoogleMapsRequire = require("google-maps");
GoogleMapsRequire.KEY = "AIzaSyCY3kHHzocQSos6QNOzJINWmNo_a4IqN-8";
GoogleMapsRequire.LIBRARIES = ["places"];

export interface INotebookConfiguration {
    routerlicious: string;
    historian: string;
    tenantId: string;
    token: string;
    npm: string;
    versions: {
        pinpoint: string;
        sharedText: string;
    };
}

class NotebookRunner extends EventEmitter implements IPlatform {
    private started = new Deferred<void>();
    private rootView: IMapView;
    private mapHost: HTMLElement;
    private runtime: IRuntime;
    private pinpoint: any;
    private sharedText: any;
    private google: GoogleMaps.google;

    public async run(runtime: IRuntime, platform: IPlatform) {
        this.google = await new Promise<GoogleMaps.google>((resolve) => {
            GoogleMaps.load((google) => {
                resolve(google);
            });
        });

        this.start(runtime, platform).then(
            () => {
                this.started.resolve();
            },
            (error) => {
                console.error(error);
                this.started.reject(error);
            });

        return this;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        // Wait for start to complete before resolving interfaces
        await this.started.promise;

        switch (id) {
            case "notebook":
                return this;
            default:
                return null;
        }
    }

    public async addPinpoint(location: string) {
        const map = new this.google.maps.Map(document.getElementById("content"));

        const places = new this.google.maps.places.PlacesService(map);
        const locationLatLon = await new Promise<any>((resolve) => {
            places.findPlaceFromQuery(
                {
                    fields: ["photos", "formatted_address", "name", "rating", "opening_hours", "geometry"],
                    query: location,
                },
                (results, status) => {
                    console.log(results);
                    resolve({
                        lat: results[0].geometry.location.lat(),
                        lon: results[0].geometry.location.lng(),
                    });
                });
            });

        const nameResult = await new Promise<any>((resolve) => {
            places.nearbySearch(
                {
                    location: { lat: locationLatLon.lat, lng: locationLatLon.lon },
                    radius: 10,
                    type: "restaurant",
                },
                (results, status) => {
                    resolve(results[0].name);
                });
            });

        console.log(nameResult);

        const marker = {
            "icon": "square",
            "label": "plain",
            "label-direction": "north",
            "labelDirection": "north",
            "lat": locationLatLon.lat,
            "lon": locationLatLon.lon,
            "text": nameResult,
        };

        this.pinpoint.addMarker(marker);
        this.sharedText.append(nameResult);
    }

    /**
     * Initializes the chaincode with the provided configuration details. Once these are received the notebook
     * goes and creates a shared string and pinpoint map.
     */
    public async initialize(configuration: INotebookConfiguration) {
        const id = this.runtime.id;

        const service = socketStorage.createDocumentService(
            configuration.routerlicious,
            configuration.historian);

        const classicPlatform = new WebPlatformFactory(null);
        const tokenService = new socketStorage.TokenService();
        const codeLoader = new loaderWeb.WebLoader(configuration.npm);

        const pinpointP = this.initializePackage(
            configuration,
            configuration.versions.pinpoint,
            `${id}-pinpoint`,
            service,
            classicPlatform,
            tokenService,
            codeLoader);

        const sharedTextP = this.initializePackage(
            configuration,
            configuration.versions.sharedText,
            `${id}-text`,
            service,
            classicPlatform,
            tokenService,
            codeLoader);

        await Promise.all([pinpointP, sharedTextP]);

        this.rootView.set("configuration", configuration);
    }

    private async loadDocument(
        configuration: INotebookConfiguration,
        id: string,
        service: IDocumentService,
        platform: WebPlatformFactory,
        tokenService: socketStorage.TokenService,
        codeLoader: loaderWeb.WebLoader): Promise<pragueLoader.Document> {

        const token = jwt.sign(
            {
                documentId: id,
                permission: "read:write", // use "read:write" for now
                tenantId: configuration.tenantId,
                user: {
                    id: "test",
                },
            },
            configuration.token);

        // Load the Prague document
        const loaderDoc = await pragueLoader.load(
            token,
            { blockUpdateMarkers: true },
            platform,
            service,
            codeLoader,
            tokenService);

        return loaderDoc;
    }

    private async initializePackage(
        configuration: INotebookConfiguration,
        pkg: string,
        id: string,
        service: IDocumentService,
        platform: WebPlatformFactory,
        tokenService: socketStorage.TokenService,
        codeLoader: loaderWeb.WebLoader): Promise<void> {

        // Load the Prague document
        const loaderDoc = await this.loadDocument(
            configuration,
            id,
            service,
            platform,
            tokenService,
            codeLoader);

        await this.initializeChaincode(loaderDoc, pkg);
    }

    private async loadPackage(
        configuration: INotebookConfiguration,
        platformInterface: string,
        id: string,
        service: IDocumentService,
        platform: WebPlatformFactory,
        tokenService: socketStorage.TokenService,
        codeLoader: loaderWeb.WebLoader): Promise<any> {

        // Load the Prague document
        const loaderDoc = await this.loadDocument(
            configuration,
            id,
            service,
            platform,
            tokenService,
            codeLoader);

        if (!loaderDoc.runtime.connected) {
            await new Promise<void>((resolve) => loaderDoc.once("connected", () => resolve()));
        }

        return loaderDoc.runtime.platform.queryInterface(platformInterface);
    }

    private async initializeChaincode(document: pragueLoader.Document, pkg: string): Promise<IPlatform> {
        const quorum = document.getQuorum();

        // Wait for connection so that proposals can be sent
        if (!document.connected) {
            await new Promise<void>((resolve) => document.on("connected", () => resolve()));
        }

        // And then make the proposal if a code proposal has not yet been made
        if (!quorum.has("code")) {
            await quorum.propose("code", pkg);
        }

        console.log(`Code is ${quorum.get("code")}`);
        return document.runtime.platform;
    }

    private async start(runtime: IRuntime, platform: IPlatform): Promise<void> {
        this.runtime = runtime;
        const collabDoc = await Document.load(runtime);

        this.mapHost = await platform.queryInterface<HTMLElement>("div");
        if (!this.mapHost) {
            return;
        }

        if (location && location.href) {
            // Remove the query string (if any) to prevent accidentally re-instantiating chaincode.
            const [baseUrl, queryString] = location.href.split("?");
            if (queryString) {
                history.pushState(null, "", baseUrl);
            }
        }

        this.rootView = await collabDoc.getRoot().getView();

        // We rely on someone connecting to this chaincode and explicitly configuring it
        this.rootView.wait<INotebookConfiguration>("configuration").then(
            (configuration) => {
                this.loadFromConfiguration(configuration);
            },
            (error) => {
                console.error(error);
            });
    }

    /**
     * Initializes the document from the provided configuration
     */
    private async loadFromConfiguration(configuration: INotebookConfiguration) {
        const id = this.runtime.id;

        const service = socketStorage.createDocumentService(
            configuration.routerlicious,
            configuration.historian);

        const classicPlatform = new WebPlatformFactory(null);
        const tokenService = new socketStorage.TokenService();
        const codeLoader = new loaderWeb.WebLoader(configuration.npm);

        const pinpointP = this.loadPackage(
            configuration,
            "pinpoint",
            `${id}-pinpoint`,
            service,
            classicPlatform,
            tokenService,
            codeLoader);

        const sharedTextP = this.loadPackage(
            configuration,
            "text",
            `${id}-text`,
            service,
            classicPlatform,
            tokenService,
            codeLoader);

        const [pinpoint, sharedText] = await Promise.all([pinpointP, sharedTextP]);
        this.pinpoint = pinpoint;
        this.sharedText = sharedText;

        console.log(configuration);
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new NotebookRunner());
    return chaincode;
}
