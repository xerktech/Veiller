// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "VeillerBluetoothSDK",
  platforms: [
    .iOS("15.1")
  ],
  products: [
    .library(
      name: "VeillerBluetoothSDK",
      targets: ["VeillerBluetoothSDK"]
    )
  ],
  targets: [
    .target(
      name: "VeillerBluetoothSDK",
      dependencies: [
        "VeillerBluetoothSDKCoreObjC"
      ],
      path: "ios/Source",
      exclude: [
        "Bridging-Header.h",
        "sgcs/Mach1.swift",
        "sgcs/MentraNex.swift",
        "sgcs/mentraos_ble.pb.swift",
        "stt",
        "tts",
        "utils/TarBz2Extractor.swift",
      ],
      resources: [
        .process("PrivacyInfo.xcprivacy")
      ]
    ),
    .target(
      name: "VeillerBluetoothSDKCoreObjC",
      path: "ios/Packages/CoreObjC",
      exclude: [
        "CoreObjC.xcodeproj",
        "makefile.mk",
        "meson.build",
      ],
      publicHeadersPath: "include",
      cSettings: [
        .headerSearchPath(".")
      ]
    )
  ]
)
