/**
 * Miniapp Store (XERK-217).
 *
 * Lists the Veiller-managed miniapps (see config/veillerMiniapps.ts) and lets
 * the user:
 *   - check/uncheck each one — checked installs + auto-updates on startup,
 *     unchecked pauses future install/update (the app stays installed if it
 *     already is; unchecking does not uninstall).
 *   - see the installed version vs. the latest available version.
 *   - install or update an app on demand.
 *
 * Available versions are resolved from each repo's GitHub Releases on mount
 * (best-effort — offline just shows "couldn't check"). Installed versions come
 * from the live engine apps list, so they refresh right after an install.
 */
import {useCallback, useEffect, useState} from "react"
import {ActivityIndicator, ScrollView, View} from "react-native"
import Toast from "react-native-toast-message"

import {Button, Header, Screen, Switch, Text} from "@/components/ignite"
import GlassView from "@/components/ui/GlassView"
import {VEILLER_MINIAPPS, type VeillerMiniappSource} from "@/config/veillerMiniapps"
import {showAlert} from "@/contexts/ModalContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {isVeillerMiniappEnabled, setVeillerMiniappEnabled} from "@/services/miniapps/veillerMiniappPrefs"
import {veillerMiniappSync, resolveLatestBundle, type InstallStage} from "@/services/miniapps/veillerMiniappSync"
import {useNavigationStore} from "@/stores/navigation"
import {engine, type ClientApp} from "@veiller/engine"

/** Where the "latest available version" lookup for one row currently stands. */
type Availability = "loading" | "resolved" | "error"

/**
 * What the row's Install/Update button is doing (XERK-225). The three busy
 * stages come straight from the sync service; `succeeded`/`failed` are terminal
 * and stay on screen until the user acts again, so the outcome of a tap is
 * never left implicit.
 */
type InstallState =
  | {stage: "idle"}
  | {stage: InstallStage}
  | {stage: "succeeded"; version: string; wasUpdate: boolean}
  | {stage: "failed"; error: string}

/** Is this row mid-install (as opposed to idle or showing a result)? */
function isBusy(install: InstallState): install is {stage: InstallStage} {
  return install.stage === "checking" || install.stage === "downloading" || install.stage === "installing"
}

/** Status line shown for each in-flight install stage. */
const STAGE_LABELS = {
  checking: "miniappStore:stageChecking",
  downloading: "miniappStore:stageDownloading",
  installing: "miniappStore:stageInstalling",
} as const satisfies Record<InstallStage, string>

interface RowState {
  enabled: boolean
  availableVersion: string | null
  availability: Availability
  install: InstallState
}

function installedApp(apps: ClientApp[], packageName: string): ClientApp | undefined {
  return apps.find((a) => a.packageName === packageName)
}

export default function MiniappStorePage() {
  const {theme} = useAppTheme()
  const {goBack} = useNavigationStore.getState()

  const [apps, setApps] = useState<ClientApp[]>(() => engine.miniapps.list())
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {}
    for (const source of VEILLER_MINIAPPS) {
      initial[source.packageName] = {
        enabled: isVeillerMiniappEnabled(source.packageName),
        availableVersion: null,
        availability: "loading",
        install: {stage: "idle"},
      }
    }
    return initial
  })

  const patchRow = useCallback((packageName: string, patch: Partial<RowState>) => {
    setRows((prev) => ({...prev, [packageName]: {...prev[packageName], ...patch}}))
  }, [])

  // Keep the installed-app list live so versions refresh after an install.
  useEffect(() => {
    engine.miniapps.refresh()
    return engine.miniapps.onChanged(setApps)
  }, [])

  /** Returns true when the check reached the registry, false on failure. */
  const resolveAvailable = useCallback(
    async (source: VeillerMiniappSource): Promise<boolean> => {
      patchRow(source.packageName, {availability: "loading"})
      try {
        const bundle = await resolveLatestBundle(source)
        patchRow(source.packageName, {availableVersion: bundle?.version ?? null, availability: "resolved"})
        return true
      } catch (error) {
        console.warn("MiniappStore: failed to resolve latest for", source.repo, error)
        patchRow(source.packageName, {availability: "error"})
        return false
      }
    },
    [patchRow],
  )

  // Resolve the latest available version for each app once on mount.
  useEffect(() => {
    for (const source of VEILLER_MINIAPPS) void resolveAvailable(source)
  }, [resolveAvailable])

  const handleToggle = (source: VeillerMiniappSource, value: boolean) => {
    setVeillerMiniappEnabled(source.packageName, value)
    patchRow(source.packageName, {enabled: value})
  }

  const handleInstall = async (source: VeillerMiniappSource) => {
    const wasUpdate = !!installedApp(apps, source.packageName)
    patchRow(source.packageName, {install: {stage: "checking"}})
    try {
      const installed = await veillerMiniappSync.installLatest(source, (stage) =>
        patchRow(source.packageName, {install: {stage}}),
      )
      // Pin "available" to what was actually installed: this bundle *is* the
      // latest one the repo publishes, so the row settles on "Up to date"
      // instead of nagging about an update that has already been applied.
      patchRow(source.packageName, {
        install: {stage: "succeeded", version: installed.version, wasUpdate},
        availableVersion: installed.version,
        availability: "resolved",
      })
      engine.miniapps.refresh()
    } catch (error) {
      const message = (error as Error)?.message ?? String(error)
      patchRow(source.packageName, {install: {stage: "failed", error: message}})
      await showAlert({
        title: translate("miniappStore:installFailedTitle"),
        message: translate("miniappStore:installFailedMessage", {appName: source.name, error: message}),
        buttons: [{text: translate("common:ok")}],
      })
    }
  }

  const handleCheckAll = async () => {
    engine.miniapps.refresh()
    // A fresh check supersedes whatever the last install attempt reported.
    const checks = VEILLER_MINIAPPS.map((source) => {
      patchRow(source.packageName, {install: {stage: "idle"}})
      return resolveAvailable(source)
    })
    const results = await Promise.all(checks)
    // Acknowledge the tap. Without this the refresh button produced no toast,
    // no spinner and no result — indistinguishable from a dead control,
    // especially offline where every check fails.
    const failed = results.filter((ok) => !ok).length
    Toast.show({
      type: failed > 0 ? "error" : "success",
      text1:
        failed > 0
          ? translate("miniappStore:checkFailed")
          : translate("miniappStore:checkComplete"),
      position: "bottom",
      visibilityTime: 2000,
    })
  }

  return (
    <Screen preset="fixed">
      <Header
        title={translate("miniappStore:title")}
        leftIcon="chevron-left"
        onLeftPress={() => goBack()}
        rightIcon="refresh"
        onRightPress={() => void handleCheckAll()}
      />
      <ScrollView className="pt-6 px-6 -mx-6" contentContainerClassName="gap-4">
        <Text text={translate("miniappStore:description")} className="text-sm text-muted-foreground px-1" />

        {VEILLER_MINIAPPS.map((source) => {
          const row = rows[source.packageName]
          const installed = installedApp(apps, source.packageName)
          const installedVersion = installed?.version ?? null
          const displayName = installed?.name ?? source.name
          const available = row.availableVersion
          const isInstalled = !!installedVersion
          // An update is only "available" for something you actually have. When
          // nothing is installed the row read "Update available" above an
          // Install button.
          const updateAvailable =
            row.availability === "resolved" && available != null && isInstalled && available !== installedVersion
          const install = row.install
          const busy = isBusy(install)

          // An in-flight install owns the status line — the user needs to see
          // that their tap is doing something, and which step it is on
          // (XERK-225). Otherwise fall back to the availability summary.
          let statusText: string
          let statusColor: string = theme.colors.textDim
          if (busy) {
            statusText = translate(STAGE_LABELS[install.stage])
            statusColor = theme.colors.text
          } else if (row.availability === "loading") {
            statusText = translate("miniappStore:checking")
          } else if (updateAvailable) {
            statusText = translate("miniappStore:updateAvailable")
            statusColor = theme.colors.text
          } else if (row.availability === "error") {
            // Checked before the installed-state branches: offline, the row
            // used to keep claiming "Up to date", which the app cannot know.
            statusText = translate("miniappStore:checkFailed")
            statusColor = theme.colors.textDim
          } else if (isInstalled) {
            statusText = translate("miniappStore:upToDate")
          } else {
            statusText = translate("miniappStore:notInstalled")
          }

          const actionLabel = isInstalled ? translate("miniappStore:update") : translate("miniappStore:install")

          return (
            <GlassView key={source.packageName} className="rounded-2xl p-4 gap-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4 gap-1">
                  <Text text={displayName} className="text-base font-semibold text-foreground" />
                  <View className="flex-row items-center gap-2">
                    {(busy || row.availability === "loading") && (
                      <ActivityIndicator size="small" color={theme.colors.textDim} />
                    )}
                    <Text text={statusText} style={{color: statusColor}} className="text-xs" />
                  </View>
                  {isInstalled && (
                    <Text
                      text={translate("miniappStore:installed", {version: installedVersion})}
                      className="text-xs text-muted-foreground"
                    />
                  )}
                  {available != null && (!isInstalled || updateAvailable) && (
                    <Text
                      text={translate("miniappStore:latest", {version: available})}
                      className="text-xs text-muted-foreground"
                    />
                  )}
                  {!row.enabled && (
                    <Text text={translate("miniappStore:updatesPaused")} className="text-xs text-muted-foreground" />
                  )}

                  {/* Outcome of the last install attempt — stays put so a tap
                      never looks like it did nothing (XERK-225). */}
                  {install.stage === "succeeded" && (
                    <Text
                      text={translate(
                        install.wasUpdate ? "miniappStore:updateSucceeded" : "miniappStore:installSucceeded",
                        {version: install.version},
                      )}
                      style={{color: theme.colors.success}}
                      className="text-xs"
                    />
                  )}
                  {install.stage === "failed" && (
                    <Text
                      text={translate("miniappStore:installFailedStatus", {error: install.error})}
                      style={{color: theme.colors.error}}
                      className="text-xs"
                    />
                  )}
                </View>
                <Switch value={row.enabled} onValueChange={(v) => handleToggle(source, v)} />
              </View>

              {/* Only checked apps offer install/update — an unchecked app is
                  paused, so re-check it to act on it now. A failed attempt keeps
                  the button around (labelled "Retry") so the user can try again. */}
              {row.enabled && (updateAvailable || busy || install.stage === "failed") && (
                <Button
                  preset="primary"
                  text={busy ? "" : install.stage === "failed" ? translate("miniappStore:retry") : actionLabel}
                  disabled={busy}
                  onPress={() => handleInstall(source)}>
                  {busy && <ActivityIndicator color={theme.colors.background} />}
                </Button>
              )}
            </GlassView>
          )
        })}
      </ScrollView>
    </Screen>
  )
}
