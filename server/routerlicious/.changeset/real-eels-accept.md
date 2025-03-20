---
"@fluidframework/server-routerlicious-base": minor
---

Adds a new resource type - IFluidAccessTokenGenerator

This resource type can be used by a new endpoint, `/api/v1/tenants/:tenantId/accesstoken`, to generate an access token for the service. This resource is customizable and can be injected into the endpoint.
