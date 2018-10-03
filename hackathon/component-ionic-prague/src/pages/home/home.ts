import { Component } from '@angular/core';
import { Camera, CameraOptions } from '@ionic-native/camera';
import * as api from "@prague/client-api";
import * as loader from "@prague/loader";
import { WebLoader, WebPlatform } from "@prague/loader-web";
import * as MergeTree from "@prague/merge-tree";
import { SharedString } from "@prague/shared-string";
import * as socketStorage from "@prague/socket-storage"
import { ModalController, NavController } from 'ionic-angular';
import * as jwt from "jsonwebtoken";
import * as sha1 from "sha.js/sha1";
import { AddItemPage } from '../add-item/add-item';
import * as bdf from "./blobDefinition";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "happy-chatterjee";
const secret = "8f69768d16e3852bc4b938cdaa0577d1";
const chainRepo = "https://packages.wu2.prague.office-int.com";

interface IAddItem {
  id: string,
  flowView: boolean,
}

interface IDocSS {
  doc: api.Document,
  sharedString: SharedString,
}

export interface IReferenceDocType {
  name: string;
}

export interface IRefLayoutSpec {
  minWidth?: number;
  minHeight?: number;
  reqWidth?: number;
  reqHeight?: number;
  ar?: number;
  dx?: number;
  dy?: number;
}

export interface IReferenceDoc {
  type: IReferenceDocType;
  sha: string;
  url: string;
  layout?: IRefLayoutSpec;
}

const referenceProperty = "ref";
 
@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  private host: HTMLElement;
 
  constructor(
    public navCtrl: NavController,
    public modalCtrl: ModalController,
    public camera: Camera) {
  }
 
  ionViewDidLoad(){
    this.host = document.getElementById("host");
    this.host.innerHTML = "";
  }
 
  addComponent(){
    const addModal = this.modalCtrl.create(AddItemPage);
    addModal.onDidDismiss((item: IAddItem) => {
      if(item){
        console.log(`Document to add ${JSON.stringify(item)}`);
        this.loadChainCode(item.id.toLowerCase());
      }
    });
    addModal.present();
  }

  addPicture() {
    const addModal = this.modalCtrl.create(AddItemPage);
    addModal.onDidDismiss((item: IAddItem) => {
      if(item){
        console.log(`Document to add ${JSON.stringify(item)}`);
        this.addImageToDocument(item.id.toLowerCase(), item.flowView);
      }
    });
    addModal.present();
  }

  doRefresh(refresher) {
    this.host.innerHTML = "";
    refresher.complete();
  }

  private addImageToDocument(documentId: string, flowView: boolean) {
    this.host.innerHTML = "";
    const resP = this.loadDoc(documentId, flowView);

    this.captureImage().then((imageData) => {
      console.log(`Took picture!`);
      resP.then((res: IDocSS) => {
        console.log(`Got sharedText`);
        const doc = res.doc as api.Document;
        this.attachBlobUploadListener(doc);  
        const imageBlob = this.convertToBlob(imageData);
        console.log(`Converted! Start uploading.`);
        doc.uploadBlob(imageBlob).then((blob: bdf.IGenericBlob) => {
          console.log(`Done uploading!`);
          console.log(blob.url);
          if (res.sharedString) {
            console.log(`Appending to shared string!`);
            const ss = res.sharedString as SharedString;
            this.insertBlobInternal(doc, ss, blob);
          }
        }, (err) => {
          this.setErrorMessage(err);
        });
      }, (error) => {
        this.setErrorMessage(error);
      });
    });
  }

  private async loadDoc(documentId: string, flowView: boolean): Promise<IDocSS> {
    api.registerDocumentService(socketStorage.createDocumentService(routerlicious, historian));
    return new Promise<IDocSS>((resolve, reject) => {
      api.load(documentId, {token: this.makeToken(documentId)}).then(async (doc: api.Document) => {
        if (flowView) {
          if (!doc.existing) {
            reject(`Document should already exist!`);
          } else {
            const root = await doc.getRoot().getView();
            await Promise.all([root.wait("text"), root.wait("ink")]);
            const sharedString = root.get("text") as SharedString;
            resolve({
              doc,
              sharedString,
            });
          }
        } else {
          resolve({
            doc,
            sharedString: undefined,
          });          
        }
      }, (error) => {
        reject(error);
      });
    });
  }

  private loadChainCode(documentId: string) {    
    this.host.innerHTML = "";
    const docDiv = document.createElement("div");
    docDiv.id = "content";
    this.host.appendChild(docDiv);

    this.loadDocument(documentId, docDiv)
  }

  private async loadDocument(documentId: string, div: HTMLDivElement) {
    const token = this.makeToken(documentId);

    const webLoader = new WebLoader(chainRepo);
    const webPlatform = new WebPlatform(div);

    const documentServices = socketStorage.createDocumentService(routerlicious, historian);
    const tokenService = new socketStorage.TokenService();

    await loader.load(
      token,
      null,
      webPlatform,
      documentServices,
      webLoader,
      tokenService,
      null,
      true);
  }

  private insertBlobInternal(collabDocument: api.Document, ss: SharedString, blob: bdf.IGenericBlob) {
    collabDocument.getBlob(blob.sha)
    .then((finalBlob) => {
      console.log(`Got Final blob to send: ${blob.url}`);
      const irdoc = this.makeBlobRef(finalBlob);
      const refProps = {
        [referenceProperty]: irdoc,
      };
      ss.insertMarker(ss.client.getLength(), MergeTree.ReferenceType.Simple, refProps);
      console.log(`Sent! Current length: ${ss.client.getLength()}`);
      this.addImageHTML(blob);
    });
  }

  private makeBlobRef(blob: bdf.IGenericBlob): IReferenceDoc {
    const irdocType = <IReferenceDocType>{
        name: "image",
    };
    const irdoc = <IReferenceDoc>{
        sha: blob.sha,
        type: irdocType,
        url: blob.url,
    };
    return irdoc;
  }

  private attachBlobUploadListener(doc: api.Document) {
    doc.on("blobUploaded", (message: any) => {
      console.log(`Uploaded event received!`);
      console.log(JSON.stringify(message));
    });
  }

  private async captureImage() {
    const options: CameraOptions = {
      quality: 100,
      destinationType: this.camera.DestinationType.DATA_URL,
      encodingType: this.camera.EncodingType.PNG,
      mediaType: this.camera.MediaType.PICTURE
    };
    return this.camera.getPicture(options);
  }

  private convertToBlob(imageData: any): bdf.IImageBlob {
    const imageBuffer = this.b64ToBuffer(imageData as string);
    const sha = this.gitHashFile(imageBuffer);
    const imageBlob: bdf.IImageBlob =  {
      content: imageBuffer,
      fileName: "does_not_matter.png",
      height: 400,
      sha,
      size: imageBuffer.byteLength,
      type: "image",
      url: `${historian}/repos/${tenantId}/git/blobs/raw/${sha}`,
      width: 400,
    };
    return imageBlob;
  }

  private addImageHTML(blob: bdf.IGenericBlob) {
    const img = document.createElement("IMG");
    img.setAttribute("src", blob.url);
    img.setAttribute("alt", "Blob can't be displayed");
    this.host.appendChild(img);
  }

  private setErrorMessage(message: string) {
    this.host.innerHTML = message;
  }

  private b64ToBuffer(base64: string): Buffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++)        {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return Buffer.from(bytes.buffer);
  }

  private makeToken(documentId: string): string {
    return jwt.sign(
      {
          documentId,
          permission: "read:write", // use "read:write" for now
          tenantId,
          user: {
              id: "test",
          },
      },
      secret);
  }

  private gitHashFile(file: Buffer): string {
    const size = file.byteLength;
    const filePrefix = "blob " + size + String.fromCharCode(0);
    const engine = new sha1();
    return engine.update(filePrefix).update(file).digest("hex");
  }
}