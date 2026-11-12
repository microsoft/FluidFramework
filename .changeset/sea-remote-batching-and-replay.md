---
"__section": other
"__includeInReleaseNotes": false
---
Improve experimental SEA remote append and replay efficiency

PostgreSQL and Azure storage now commit bounded event groups and fetch replay pages instead of making separate persistence and read requests for every event.
Writes retain service-enforced fencing without redundant ownership probes.
Authoritative heads, page-boundary ownership checks, uncertain-write handling, and existing persisted formats are preserved.
