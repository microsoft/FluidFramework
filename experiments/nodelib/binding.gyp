{
    "includes": [
        "common.gypi"
    ],
    "targets": [
        {
            "target_name": "test",
            "type": "executable",
            "sources": [
                "./test.cc"
            ],
            "include_dirs": [
                "include",
                "/Users/kurtb/dev/node/src",
                "/Users/kurtb/dev/node/deps/v8",
                "/Users/kurtb/dev/node/deps/v8/include",
                "/Users/kurtb/dev/node/deps/uv/include"
            ],
            "libraries": [
                "/Users/kurtb/dev/node/out/Release/libnode.57.dylib"
            ]
        }
    ]
}
