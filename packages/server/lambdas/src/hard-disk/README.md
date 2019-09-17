# Hard Disk

![Man's first steps toward the SSD.](https://www.backblaze.com/blog/wp-content/uploads/2016/11/BRL61-IBM_305_RAMAC.jpeg)

The proverbial hard disk is [slow, (comparatively) fragile, and antiquated](https://en.wikipedia.org/wiki/Hard_disk_drive#Performance_characteristics), but also price-competitve and compelling for cold storage backups.

In our case, the hard-disk lambda retrieves raw deltas from Kafka and then writes this data to a database for longer-term, "set it and forget it {and _occasionally_ look into it}" storage.