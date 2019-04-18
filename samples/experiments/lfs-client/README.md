# Test implementation of a git lfs client


Example response from git server during lfs pull: 


2018-06-06T18:37:11Z 904d674a5404 lfs[7] [server.go:659]: method=POST url=/objects/batch status=401 request_id=0ec63c1f-b4ea-4e1f-61d9-8bae2b2582ac

2018-06-06T18:37:11Z 904d674a5404 lfs[7] [server.go:341]: method=POST url=/objects/batch status=200 request_id=ed5b941c-8dac-a4e2-c3d6-f0faea027b53

2018-06-06T18:37:11Z 904d674a5404 lfs[7] [server.go:256]: method=GET url=/objects/a6279ea59535455d9371c481893dde3a313e2b4d02022241408bdfcfe1304962 status=200 request_id=43303c21-0101-3c9e-d696-c4363320cfa5

2018-06-06T18:37:11Z 904d674a5404 lfs[7] [server.go:256]: method=GET url=/objects/6acbe263d22ac18f211b2194fa84aa4072d68bdbdc101c3fdf04966121817768 status=200 request_id=0be1e4f3-a451-af90-5447-2ab9ed2e2236
