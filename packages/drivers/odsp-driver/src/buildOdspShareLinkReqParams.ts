import { ShareLinkTypes, SharingLinkKind } from "@fluidframework/odsp-driver-definitions";

/**
 * Build request parameters to request for the creation of a sharing link along with the creation of the file
 * through the /snapshot api call.
 * @param shareLinkType - Kind of sharing link reuested
 * @returns A string of request parameters that can be concatenated with the base URI
 */
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
