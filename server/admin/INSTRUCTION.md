# Fluid authentication instruction
This document provides instruction for creating a fluid tenant and authenticate to the api using json web token.

## Creating a tenant
The first step is to create a tenant. A tenant is representative of a team/org using Fluid API. Navigate to https://admin.wu2.prague.office-int.com/ and add a new tenant with one of the three storage endpoints. Selecting 'github' as a storage endpoint would require more info such as github repository, username, and credential.

Once a tenant is created, click view, copy the **tenant id** and generated **secret key** for the next step.

## Crafting and passing authentication token
Create a json object, sign it with the generate secret key, and pass the signed token to Fluid api load call. Fluid api verifies the token using the secret key. Once the token is verified, user gets access to the document.

Fluid uses [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) library for verifying the token. Below is an example of a token creation:

```javascript
    import * as jwt from "jsonwebtoken";

    const tenantId = "gallant-hugle";
    const secret = "03302d4ebfb6f44b662d00313aff5a46";

    const signed_token = jwt.sign(
        {
            documentId: <document_id>, // required
            tenantId: tenantId, // required.
            scopes: ["doc:read", "doc:write", "summary:write"],
            user: {
                id: <unique_user_id>, // required. use oid provided by AAD auth.
            },
        }, secret);
```

### Passing auth token
To use the token, register to fluid API with the **endpoints** and **tenantId**. Then just add a token field to api load call. Below is an example:
```javascript
import { api as fluid } from "@microsoft/fluid-server-routerlicious";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "gallant-hugle";

fluid.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

fluid.api.load(id, { encrypted: false, token: signed_token }).then((document) => {
    // document.getUser() will return an object with verified user information.
}, (error) => {
    // Invalid token error
});
```

Checkout [this](https://github.com/Microsoft/FluidFramework/blob/master/doc/api/examples/sequence/src/index.ts) for a complete example.
