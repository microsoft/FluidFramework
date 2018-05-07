# Prague authentication instruction
This document provides instruction for creating a prague tenant and authenticate to the api using json web token.

## Creating a tenant
The first step is to create a tenant. A tenant is representative of a team/org using Prague API. Navigate to https://admin.wu2.prague.office-int.com/ and add a new tenant with one of the three storage endpoints. Selecting 'github' as a storage endpoint would require more info such as github repository, username, and credential.

Once a tenant is created, click view, copy the **tenant id** and generated **secret key** for the next step.

## Crafting and passing authentication token
Create a json object, sign it with the generate secret key, and pass the signed token to Prague api load call. Prague api verifies the token using the secret key. Once the token is verified, user gets access to the document.

Prague uses [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) library for verifying the token. Below is an example of a token creation:

```javascript
    import * as jwt from "jsonwebtoken";

    const tenantId = "gallant-hugle";
    const secret = "03302d4ebfb6f44b662d00313aff5a46";

    const signed_token = jwt.sign(
        {
            documentId: <document_id>, // required
            tenantId: tenantId, // required.
            permission: "read:write", // use "read:write" for now
            user: {
                id: <unique_user_id>, // required. use oid provided by AAD auth.
            },
        }, secret);
```

### Passing auth token
To use the token, register to prague API with the **endpoints** and **tenantId**. Then just add a token field to api load call. Below is an example:
```javascript
import { api as prague } from "@prague/routerlicious";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "gallant-hugle";

prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

prague.api.load(id, { encrypted: false, token: signed_token }).then((document) => {
    // document.getUser() will return an object with verified user information.
}, (error) => {
    // Invalid token error
});
```

Checkout [this](https://github.com/Microsoft/Prague/blob/master/doc/api/examples/sequence/src/index.ts) for a complete example.