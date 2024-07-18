---
"@fluidframework/tinylicious-client": minor
---

Promote APIs from `@beta` to `@public`

Some tinylicious-client APIs were marked beta in previous releases. These APIs are now correctly marked public and also
sealed to indicate they are not to be implemented externally to Fluid Framework and not changed.

Updated APIs:

- [ITinyliciousAudience](https://fluidframework.com/docs/api/v2/tinylicious-client/itinyliciousaudience-typealias) sealed
- [TinyliciousClient](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousclient-class) sealed
- [TinyliciousClientProps](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousclientprops-interface) sealed
- [TinyliciousConnectionConfig](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousconnectionconfig-interface) sealed
- [TinyliciousContainerServices](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciouscontainerservices-interface) sealed
- [TinyliciousMember](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousmember-interface) sealed
- [TinyliciousUser](https://fluidframework.com/docs/api/v2/tinylicious-client/tinylicioususer-interface) sealed
