---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/driver-definitions": major
"@fluidframework/driver-utils": major
"@fluidframework/odsp-doclib-utils": major
"@fluidframework/odsp-driver-definitions": major
---

Handle DriverErrorType.outOfStorage error from driver and load the container in readonly mode.

Handle DriverErrorType.outOfStorage error from driver and load the container in readonly mode. Currently there is no handling and when the join session throws this error, the container will get closed. With this we use NoDeltaStream object as connection and load the container in read mode, so that it loads properly. We also notify the that the container is "readonly" through the event on delta manager so that apps can listen to this and show any UX etc. The app can listen to the event like this:
container.deltaManager.on("readonly", (readonly?: boolean, readonlyConnectionReason?: { text: string, error?: IErrorBase}) => {
           // reason will be equal to DriverErrorType.outOfStorage in this case
          // App logic
});
