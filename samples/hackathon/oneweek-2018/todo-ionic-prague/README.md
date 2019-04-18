# IONIC todo app leveraging Prague runtime

1. Because of ionic compatibility issue, we are using an older typescript version. You need to change the typescript definition file if needed.
2. Need to disable dgram in webpack config file since standard ionic webpack config does not do that.
3. This repo does not include any resource files. You need to copy over the standard resource folder from an starter ionic app.