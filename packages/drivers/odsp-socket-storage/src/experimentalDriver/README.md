This folder contains an experimental rewrite of pieces of the odsp-socket-storage driver. This driver should provide better performance out of the box and is compatible with the incoming change to make it such that join session does not return socket and storage tokens. We are choosing to fork the driver in the repo to enable dark deployment of these changes in a safe manner.

Once this experimental driver is stable, it will replace the current ODSP driver.
