/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// // import * as api from "@prague/client-api";
// import * as loader from "@prague/loader";
// import * as api from "@prague/client-api";
// import { WebLoader, WebPlatformFactory} from "@prague/loader-web";
// import * as socketStorage from "@prague/socket-storage";
// import * as jwt from "jsonwebtoken";
// import { JSDOM } from "jsdom";
// import { IMap, MapExtension } from "@prague/map";
// // import { ICollaborativeObject } from "@prague/shared-object-common";

// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
// const chainRepo = "https://packages.wu2.prague.office-int.com";

// export class Loader {
//     private host: HTMLElement;

//     constructor() {
//         console.log("constructed");
//         const { document } = (new JSDOM(`...`)).window;

//         this.host = document.createElement("div");
//         const div = document.createElement("div");
//         div.id = "content";
//         this.host.appendChild(div);
//     }

//     public async loadDocument(documentId: string): Promise<loader.Document> {
//         const div = this.host.firstChild as HTMLDivElement;
//         const token = this.makeToken(documentId);

//         const webLoader = new WebLoader(chainRepo);
//         // const webPlatform = new WebPlatform(undefined);
//         // const componentP = new Promise<T>((resolver) => {
//         //     webPlatform["component"] = resolver;
//         // });

//         const webPlatformFactory = new WebPlatformFactory(div);

//         const documentServices = socketStorage.createDocumentService(routerlicious, historian);
//         const tokenService = new socketStorage.TokenService();

//         const document = await loader.load(
//           token,
//           null,
//           webPlatformFactory,
//           documentServices,
//           webLoader,
//           tokenService,
//           null,
//           true);

//         let root: IMap;
//         if (!document.existing) {
//             root = document.runtime.createChannel("root", MapExtension.Type) as IMap;
//             root.attach();

//         } else {
//             root = await document.runtime.getChannel("root") as IMap;
//         }

//         console.log(root.keys());
//         return document;
//     }

//     public async loadApiDoc(documentId: string): Promise<api.Document> {
//         api.registerDocumentService(socketStorage.createDocumentService(routerlicious, historian));
//         const doc = await api.load(documentId, {token: this.makeToken(documentId)});

//         const root = doc.getRoot();
//         console.log(await root.keys());
//         if (!(await root.has("val"))) {
//             await root.set("val", doc.createMap());
//         }
//         console.log(await root.keys());
//         return doc;
//     }

//     private makeToken(documentId: string): string {
//         return jwt.sign(
//           {
//               documentId,
//               permission: "read:write", // use "read:write" for now
//               tenantId,
//               user: {
//                   id: "test",
//               },
//           },
//           secret);
//       }
// }
