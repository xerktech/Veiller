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

import {Button, Header, Screen, Switch, Text} from "@/components/ignite"
import GlassView from "@/components/ui/GlassView"
import {VEILLER_MINIAPPS, type VeillerMiniappSource} from "@/config/veillerMiniapps"
import {showAlert} from "@/contexts/ModalContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {isVeillerMiniappEnabled, setVeillerMiniappEnabled} from "@/services/miniapps/veillerMiniappPrefs"
import {veillerMiniappSync, resolveLatestBundle} from "@/services/miniapps/veillerMiniappSync"
import {useNavigationStore} from "@/stores/navigation"
import {engine, type ClientApp} from "@mentra/engine"

/** Where the "latest available version" lookup for one row currently stands. */
type Availability = "loading" | "resolved" | "error"

interface RowState {
  enabled: boolean
  availableVersion: string | null
  availability: Availability
  installing: boolean
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
        installing: false,
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

  const resolveAvailable = useCallback(
    async (source: VeillerMiniappSource) => {
      patchRow(source.packageName, {availability: "loading"})
      try {
        const bundle = await resolveLatestBundle(source)
        patchRow(source.packageName, {availableVersion: bundle?.version ?? null, availability: "resolved"})
      } catch (error) {
        console.warn("MiniappStore: failed to resolve latest for", source.repo, error)
        patchRow(source.packageName, {availability: "error"})
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
    patchRow(source.packageName, {installing: true})
    try {
      await veillerMiniappSync.installLatest(source)
      engine.miniapps.refresh()
    } catch (error) {
      await showAlert({
        title: translate("miniappStore:installFailedTitle"),
        message: translate("miniappStore:installFailedMessage", {
          appName: source.name,
          error: (error as Error)?.message ?? String(error),
        }),
        buttons: [{text: translate("common:ok")}],
      })
    } finally {
      patchRow(source.packageName, {installing: false})
    }
  }

  const handleCheckAll = () => {
    engine.miniapps.refresh()
    for (const source of VEILLER_MINIAPPS) void resolveAvailable(source)
  }

  return (
    <Screen preset="fixed">
      <Header
        title={translate("miniappStore:title")}
        leftIcon="chevron-left"
        onLeftPress={() => goBack()}
        rightIcon="refresh"
        onRightPress={handleCheckAll}
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
          const updateAvailable =
            row.availability === "resolved" && available != null && (!isInstalled || available !== installedVersion)

          let statusText: string
          let statusColor: string = theme.colors.textDim
          if (row.availability === "loading") {
            statusText = translate("miniappStore:checking")
          } else if (updateAvailable) {
            statusText = translate("miniappStore:updateAvailable")
            statusColor = theme.colors.text
          } else if (isInstalled) {
            statusText = translate("miniappStore:upToDate")
          } else if (row.availability === "error") {
            statusText = translate("miniappStore:checkFailed")
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
                    {row.availability === "loading" && <ActivityIndicator size="small" color={theme.colors.textDim} />}
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
                </View>
                <Switch value={row.enabled} onValueChange={(v) => handleToggle(source, v)} />
              </View>

              {/* Only checked apps offer install/update — an unchecked app is
                  paused, so re-check it to act on it now. */}
              {row.enabled && (updateAvailable || row.installing) && (
                <Button
                  preset="primary"
                  text={row.installing ? "" : actionLabel}
                  disabled={row.installing}
                  onPress={() => handleInstall(source)}>
                  {row.installing && <ActivityIndicator color={theme.colors.background} />}
                </Button>
              )}
            </GlassView>
          )
        })}
      </ScrollView>
    </Screen>
  )
}
