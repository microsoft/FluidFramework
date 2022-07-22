import { ShareLinkTypes, SharingLinkKind } from "@fluidframework/odsp-driver-definitions";

export function buildOdspShareLinkReqParams(shareLinkType: ShareLinkTypes | SharingLinkKind | undefined) {
    if (!shareLinkType) {
        return;
    }
    const linkScope = (shareLinkType as SharingLinkKind).linkScope;
    if (!linkScope) {
        return `createLinkType=${shareLinkType}`;
    }
    let shareLinkRequestParams = `createLinkScope=${linkScope}`;
    const linkRole = (shareLinkType as SharingLinkKind).linkRole;
    shareLinkRequestParams = linkRole ? `${shareLinkRequestParams}&createLinkRole=${linkRole}` : shareLinkRequestParams;
    return shareLinkRequestParams;
}
