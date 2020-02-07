/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-core-utils";
import { IDocumentServiceFactory } from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { WebCodeLoader } from "@microsoft/fluid-web-code-loader";
import { Loader } from "@microsoft/fluid-container-loader";
import Axios from "axios";
import * as jwt from "jsonwebtoken";

export class DocumentFactory {
    private loaderDeferred = new Deferred<ILoader>();

    constructor(
      private readonly baseUrl: string,
      private readonly tenantId: string,
      private readonly moniker?: string,
      private readonly url?: string,
    ) {
    }

    /**
     * Sets the loader the factory should used to create new documents with. We set after the fact given that
     * the loader is given its scope as part of construction.
     */
    public resolveLoader(loader: ILoader) {
        this.loaderDeferred.resolve(loader);
    }

    public async create(chaincode: IFluidCodeDetails): Promise<string> {
        const monikerP = new Promise(async (resolve) => {
            if (this.moniker) {
                resolve(this.moniker);
            } else {
                const res = await Axios.get(`${this.baseUrl}/api/v1/moniker`);
                resolve(res.data);
            }
        });
        const [loader, moniker] = await Promise.all([
            this.loaderDeferred.promise,
            monikerP,
        ]);

        // generate a moniker to use as part of creating the new document
        const url = this.url ? this.url : `${this.baseUrl}/loader/${this.tenantId}/${moniker}`;
        const resolved = await loader.resolve({ url });

        // TODO need connected flag on the IContainer
        if (!(resolved as any).connected) {
            await new Promise((r) => resolved.once("connected", r));
        }

        const quorum = resolved.getQuorum();
        if (quorum.has("code")) {
            return Promise.reject("Code has already been proposed on document");
        }

        quorum.propose("code", chaincode);

        return url;
    }
}

Office.onReady(info => {
  start(info);
});

function start(info) {
  // const host = "http://localhost:3000";
  const host = "https://www.wu2.prague.office-int.com";
  const key = "VBQyoGpEYrTn3XQPtXW3K8fFDd";
  const tenantId = "fluid";
  const jwtToken = jwt.sign(
    {
        user: { id: "test" },
    },
    key);

  const documentServiceFactories: IDocumentServiceFactory[] = [];
  const documentFactory = new DocumentFactory(host, tenantId);

  documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
    false,
    new DefaultErrorTracking(),
    false,
    true));

  const resolver = new ContainerUrlResolver(host, jwtToken);
  const codeLoader = new WebCodeLoader();
  const loader = new Loader(
    resolver,
    documentServiceFactories,
    codeLoader,
    {},
    undefined);
  documentFactory.resolveLoader(loader);

  
  document.getElementById("app-body").style.display = "flex";
  document.getElementById("run").onclick = () => run(loader, documentFactory, info.host === Office.HostType.Outlook);
}

async function attach(loader: ILoader, url: string, div: HTMLDivElement) {
  const response = await loader.request({ url });

  if (response.status !== 200 || response.mimeType !== "fluid/component") {
    return;
  }

  const component = response.value as IComponent;
  const viewable = component.IComponentHTMLVisual;

  const renderable = viewable.addView ? viewable.addView() : viewable;

  renderable.render(div, { display: "block" });

  const editor = (component as any).IRichTextEditor;

  Office.context.document.getSelectedDataAsync(
    Office.CoercionType.Text,
    (result) => {
      editor.initializeValue(result.value);

      editor.on(
        "valueChanged",
        () => {
          updateBody(editor.getValue());
        })
    });
}

let pendingSet: boolean = false
let pendingValue: string;

function updateBody(newValue: string) {
  if (pendingSet) {
    pendingValue = newValue;
    return;
  }

  pendingSet = true;
  pendingValue = undefined;

  const outerDiv = document.createElement("div");
  outerDiv.innerHTML = newValue;
  const justText = outerDiv.innerText;

  /**
   * Insert your PowerPoint code here
   */
  Office.context.document.setSelectedDataAsync(
    justText,
    {
      coercionType: Office.CoercionType.Text
    },
    () => {
      pendingSet = false;

      if (pendingValue) {
        updateBody(pendingValue);
      }
    }
  );
}

export async function run(loader: Loader, documentFactory: DocumentFactory, inOffice = false) {
  const div = document.getElementById("content") as HTMLDivElement;
  const link = document.getElementById("url-href") as HTMLAnchorElement;

  // const pkg = {
  //   config: {
  //     "@gateway:cdn": "https://localhost:8080/dist/main.bundle.js",
  //   },
  //   package: {
  //     name: "@gateway/e115e92a-98f4-4ee5-99a4-23124b7566f1",
  //     version:"0.0.0",
  //     fluid: {
  //       browser: {
  //         umd: { "files": ["https://localhost:8080/dist/main.bundle.js"], "library": "main" }
  //       }
  //     }
  //   }
  // };

  const pkg = {
    config: {
      "@fluid-example:cdn": "https://pragueauspkn-3873244262.azureedge.net",
    },
    package: "@fluid-example/prosemirror@0.10.14926",
  };

  const url = await documentFactory.create(pkg);

  console.log(url);
  link.href = url;
  link.innerText = url;

  const container = await loader.resolve({ url });
  container.on("contextChanged", (value) => {
    attach(loader, url, div);
  });
  attach(loader, url, div);  
}
