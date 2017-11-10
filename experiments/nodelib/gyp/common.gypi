{
  "conditions": [
    ["OS=='win'", {
          "target_defaults": {
            "default_configuration": "Release_x64",
            "configurations": {
              "Debug_Win32": {
                "msvs_configuration_platform": "Win32",
              },
              "Debug_x64": {
                "msvs_configuration_platform": "x64",
              },
              "Release_Win32": {
                "msvs_configuration_platform": "Win32",
              },
              "Release_x64": {
                "msvs_configuration_platform": "x64",
              }
            }
          }
    }, {
        "target_defaults": {
            "default_configuration": "Release",
            "xcode_settings": {
            },
            "configurations": {
                "Debug": {
                    "defines": [
                        "DEBUG"
                    ],
                    "xcode_settings": {
                        "GCC_OPTIMIZATION_LEVEL": "0",
                        "GCC_GENERATE_DEBUGGING_SYMBOLS": "YES"
                    }
                },
                "Release": {
                    "defines": [
                        "NDEBUG"
                    ],
                    "xcode_settings": {
                        "GCC_OPTIMIZATION_LEVEL": "3",
                        "GCC_GENERATE_DEBUGGING_SYMBOLS": "NO",
                        "DEAD_CODE_STRIPPING": "YES",
                        "GCC_INLINES_ARE_PRIVATE_EXTERN": "YES",
                        'CLANG_CXX_LIBRARY': 'libc++',
                        'CLANG_CXX_LANGUAGE_STANDARD':'c++1y'
                    }
                }
            }
        }
    }]
  ]
}

