import {registerWebModule, NativeModule} from "expo"

import {CrustModuleEvents} from "./Crust.types"

class CrustModule extends NativeModule<CrustModuleEvents> {
  PI = Math.PI
  async setValueAsync(value: string): Promise<void> {
    this.emit("onChange", {value})
  }
  async nativeHttpRequest(method: string, url: string, headers: Record<string, string>, body?: string | null) {
    const response = await fetch(url, {method, headers, body})
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    }
  }
  hello() {
    return "Hello world! 👋"
  }
  showAVRoutePicker(_tintColor?: string | null) {}
  async setDeferredSystemGestures(_edges: string[]): Promise<void> {}
  async setNotificationConfig(_listenerEnabled: boolean, _blocklist: string[]): Promise<void> {}
  async getInstalledApps() {
    return []
  }
  async getInstalledAppsForNotifications() {
    return []
  }
  async hasNotificationListenerPermission() {
    return false
  }
  async refreshNotificationListener() {
    return false
  }
  async openNotificationListenerSettings() {
    return false
  }
  async isBetaBuild() {
    return false
  }
  async veillerJsSpawn(_pkg: string, _polyfill: string, _miniappJs: string) {
    return false
  }
  async veillerJsEvaluate(_pkg: string, _src: string) {
    return null
  }
  async veillerJsKill(_pkg: string) {
    return
  }
  async veillerJsDispatchToJs(_pkg: string, _env: Record<string, unknown>) {
    return
  }
  async veillerJsSetManifest(_pkg: string, _perms: string[]) {
    return
  }
  veillerJsAlivePackages() {
    return []
  }
  async veillerJsDebugForceGC(_pkg: string) {
    return false
  }
  veillerJsLoadPolyfillBundle() {
    return ""
  }
}

export default registerWebModule(CrustModule, "CrustModule")
