#!/usr/bin/env zx
// Build iOS archive with VEILLER_BUILD_NAME=Veiller-Stable so it installs alongside
// the regular Veiller build (bundle: com.xerktech.veiller.stable, label: "stable").

process.env.VEILLER_BUILD_NAME = "Veiller Stable"

import {setBuildEnv} from "./set-build-env.mjs"
await setBuildEnv()

const now = new Date()
const date = now.toLocaleDateString("en-US", {month: "2-digit", day: "2-digit", year: "2-digit"})
const time = now.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit", hour12: true})
const archiveName = `Veiller-Stable-${date.replace(/\//g, "-")}, ${time}.xcarchive`

const archiveDate = now.toISOString().split("T")[0]
const archivePath = `${os.homedir()}/Library/Developer/Xcode/Archives/${archiveDate}/${archiveName}`

console.log(chalk.blue(`Building stable archive: ${archiveName}`))
console.log(chalk.blue(`VEILLER_BUILD_NAME=stable (bundle: com.xerktech.veiller.stable)`))

await $({stdio: "inherit"})`bun expo prebuild --platform ios`

await $({stdio: "inherit"})`cp .env ios/.xcode.env.local`

await $({
  stdio: "inherit",
  env: process.env,
})`xcodebuild archive \
  -workspace ios/Veiller.xcworkspace \
  -scheme Veiller \
  -configuration Release \
  -destination generic/platform=iOS \
  -archivePath ${archivePath}`

console.log(chalk.green("✓ Stable archive created!"))
console.log(chalk.blue("Open: Xcode > Window > Organizer"))
console.log(chalk.blue("Then: Distribute App > Debugging > Install on device"))
