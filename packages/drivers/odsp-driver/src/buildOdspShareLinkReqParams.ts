import { ShareLinkTypes, ShareLink } from "@fluidframework/odsp-driver-definitions";

export function buildOdspShareLinkReqParams(shareLinkType: ShareLinkTypes | ShareLink | undefined) {
    let shareLinkRequestParams = "";
    if (shareLinkType) {
        const linkScope = (shareLinkType as ShareLink).linkScope;
        if (linkScope) {
            shareLinkRequestParams = `createLinkScope=${linkScope}`;
            const linkRole = (shareLinkType as ShareLink).linkRole;
            if (linkRole) {
                shareLinkRequestParams += `&createLinkRole=${linkRole}`;
            }
        } else {
            shareLinkRequestParams = `createLinkType=${shareLinkType}`;
        }
    }
    return shareLinkRequestParams;
}
