import { Document } from "@prague/app-component";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { LoaderComponent } from "./chaincode-mounter";

export class LoaderChaincode extends Document {
  // Initialize the document/component (only called when document is initially created).
    protected async create() {
        
        let serverUrl: string;
        if (document.location.origin.includes("localhost")) {
            serverUrl = "https://alfred.wu2-ppe.prague.office-int.com";
        } else {
            serverUrl = document.location.origin;
        }
//     "@chaincode/counter": "^0.0.5241",

        this.root.set<string>("docId", "funny-doc-id");
        this.root.set<string>("serverUrl", serverUrl);
        // TODO: get drop down of chaincodes from verdaccio... check Flow for this info.
        this.root.set<string>("chaincodePackage", "@chaincode/counter@0.0.5241");
        this.root.set<boolean>("shouldRender", false);

    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened() {
      // If the host provided a <div>, display a minimual UI.
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");        

        if (maybeDiv) {
            const docId = await this.root.wait<string>("docId");
            const serverUrl = await this.root.wait<string>("serverUrl");
            const chaincodePackage = await this.root.wait<string>("chaincodePackage");
            const shouldRender = await this.root.wait<boolean>("shouldRender");

            // Set up Form
            const docSpan = document.createElement("span");
            const docInput = document.createElement("input");
            docInput.id = "docInput";
            docInput.type = "text";
            docInput.value = docId;
            docSpan.textContent = "Document Id: ";
            docSpan.appendChild(docInput);

            const serverSpan = document.createElement("span");
            const serverInput = document.createElement("input");
            serverInput.id = "serverInput";
            serverInput.type = "text";
            serverInput.value = serverUrl;
            serverSpan.textContent = "Server Url: ";
            serverSpan.appendChild(serverInput);

            const chaincodeSpan = document.createElement("span");
            const chaincodeInput = document.createElement("input");
            chaincodeInput.id = "chaincodeInput";
            chaincodeInput.type = "text";
            chaincodeInput.value = chaincodePackage;
            chaincodeSpan.textContent = "chaincode Url: ";
            chaincodeSpan.appendChild(chaincodeInput);

            const submit = document.createElement("input");
            submit.id = "submit";
            submit.type = "button";
            submit.value = "Render This Chaincode!!!"

            maybeDiv.append(docSpan);
            maybeDiv.append(document.createElement("br"));
            maybeDiv.append(serverSpan);
            maybeDiv.append(document.createElement("br"));
            maybeDiv.append(chaincodeSpan);
            maybeDiv.append(document.createElement("br"));
            maybeDiv.append(submit);

            // Render Function
            const submitClick =  () => {
                this.root.set("shouldRender", true);
            };

            const render = () => {
                docInput.readOnly = true;
                serverInput.readOnly = true;
                chaincodeInput.readOnly = true;
                submit.readOnly = true;

                ReactDOM.render(
                    <LoaderComponent
                        chaincodePackage={chaincodeInput.value}
                        docId={docInput.value}
                        mountedElement={chaincodeHost}
                        serverUrl={serverInput.value}>
                    </LoaderComponent>,
                    chaincodeHost
                );
            };

            this.root.on("valueChanged", async (changed) => {
                switch (changed.key) {
                    case "docId":
                        docInput.value = await this.root.get(changed.key);
                        break;
                    case "serverUrl":
                        serverInput.value = await this.root.get(changed.key);
                        break;
                    case "chaincodePackage":
                        chaincodeInput.value = await this.root.get(changed.key);
                        break;
                    case "shouldRender":
                        if (await this.root.get(changed.key)) {
                            render();
                        }
                }
            });

            docInput.addEventListener("change", () => {
                this.root.set("docId", docInput.value);
            });
            serverInput.addEventListener("change", () => {
                this.root.set("serverUrl", serverInput.value);
            });
            chaincodeInput.addEventListener("change", () => {
                this.root.set("chaincodePackage", chaincodeInput.value);
            });            

            const chaincodeHost = document.createElement("div");
            maybeDiv.append(chaincodeHost);

            submit.onclick = submitClick;
            if (shouldRender) {
                render();
            }
        }
    }
}
