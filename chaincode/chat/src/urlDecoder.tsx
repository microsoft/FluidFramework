import { IOutieProps } from "./component-loader";

export function findComponent(message: string): IOutieProps | undefined {
    const url = findLoadableUrl(message);
    if (!url) {
        return;
    }

    const outie = {
        chaincodePackage: getChaincode(url),
        componentId: getComponentId(url),
        serverUrl: getServerUrl(url),
    }
    return outie;
}

// https://alfred.wu2-ppe.prague.office-int.com/loader/stupefied-kilby/ttttttaaan?chaincode=@chaincode/shared-text@0.3.5321

function findLoadableUrl(message: string): string | undefined {
    const index = message.indexOf("https://");
    if (index === -1) {
        return;
    }

    // We found a URL
    const messageStartingAtHttp = message.substring(index);
    const indexFinalSpace = message.indexOf(" ");
    if (indexFinalSpace === -1) {
        return messageStartingAtHttp;
    } else {
        return messageStartingAtHttp.substring(0, indexFinalSpace);
    }
}

function getServerUrl(url: string): string {
    if (url.indexOf("localhost") !== -1 ) {
        return "http://localhost:3000";
    }

    let end = url.indexOf(".com");
    if (end === -1) {
        return "";
    }
    end = end + 4;
    const serverUrl = url.substring(0, end);
    return serverUrl;
}

function getComponentId(url: string): string {
    const questionEnd = url.indexOf("?");
    const baseUrl = url.substring(0, questionEnd);
    const finalSlash = baseUrl.lastIndexOf("/") + 1;
    return baseUrl.substring(finalSlash);

}

function getChaincode(url: string): string {
    const start = url.indexOf("@");
    if (start === -1) {
        return "";
    }

    const chaincode = url.substring(start);
    console.log(chaincode);
    return chaincode;
}