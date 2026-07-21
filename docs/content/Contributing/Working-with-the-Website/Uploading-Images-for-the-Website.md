# Uploading Images for the Website

> Note: as of June 2026, website images are served from the **fluidframeworkcdn** storage account in the **FluidFramework** (Torus) subscription. The old `fluidframework` account is no longer the CDN origin, do not upload there. Accessing `fluidframeworkcdn` requires a SAW with JIT elevation and the **Storage Blob Data Contributor** role (the account has shared-key auth disabled, so use "Microsoft Entra user account").

1. From a SAW, go to <https://portal.azure.com>.
1. Go to the fluidframeworkcdn storage account (FluidFramework subscription).
1. Click "Storage browser" in the left-nav.
1. Expand "Blob containers," and open the static container.
1. Change "Authentication Method" to "Microsoft Entra user account"
1. Navigate to wherever you want the file to go. Typically this is static/images.
1. Upload the file.
1. Select it and click "Copy URL" in the toolbar to get the URL. It should be of the form: <https://fluidframeworkcdn.blob.core.windows.net/static/images/IMAGE.png>
1. Use the same pathname, but replace the hostname of the URL with `storage.fluidframework.com` to get the form:
   <https://storage.fluidframework.com/static/images/IMAGE.png>

> Using storage.fluidframework.com ensures the image is served from our CDN rather than directly from blob storage.
