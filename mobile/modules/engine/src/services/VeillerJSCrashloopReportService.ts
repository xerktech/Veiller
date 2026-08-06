import {submitAutomaticReport} from "../facades/reports"
import {useAppStatusStore} from "../stores/apps"
import {
  logAutomaticReportSubmissionStatus,
  toAutomaticReportSubmissionStatus,
  type AutomaticReportSubmissionStatus,
} from "./AutomaticReportResult"
import {getMiniappEngine} from "./MiniappEngine"
import {islandNotifications, type IslandNotification} from "./NotificationsEmitter"

const LOG_TAG = "VeillerJSCrashloopReport"

let unsubscribe: (() => void) | null = null

export async function submitVeillerJSCrashloopReport(params: {
  packageName: string
  reason: string
  lastLogLines?: string[]
}): Promise<AutomaticReportSubmissionStatus> {
  const {packageName, reason, lastLogLines = []} = params
  const app = useAppStatusStore.getState().apps.find((a) => a.packageName === packageName)
  const appName = app?.name ?? packageName
  const result = await submitAutomaticReport({
    kind: "automatic",
    trigger: {
      type: "automatic",
      source: "miniapp_crashloop",
      reason: "veillerjs_crashloop_disabled",
      sourceAppletPackageName: packageName,
      sourceAppletName: appName,
    },
    report: {
      expectedBehavior: `${appName} should run without crashing.`,
      actualBehavior: JSON.stringify({reason, lastLogLines}, null, 2),
      systemPriority: "critical",
    },
    throttleKey: `veillerjs_crashloop:${packageName}`,
  })

  const status = toAutomaticReportSubmissionStatus(result)
  logAutomaticReportSubmissionStatus(LOG_TAG, status, packageName)
  return status
}

function handleNotification(notification: IslandNotification): void {
  if (notification.kind !== "miniapp_crashloop" || !notification.packageName) return
  const packageName = notification.packageName
  const lastLogLines = getMiniappEngine()?.router.logRing.snapshot(packageName) ?? []
  void submitVeillerJSCrashloopReport({
    packageName,
    reason: notification.reason,
    lastLogLines,
  }).catch((error) => {
    console.error(`[${LOG_TAG}] Unexpected error:`, error)
  })
}

export function startVeillerJSCrashloopReportService(): void {
  if (unsubscribe) return
  unsubscribe = islandNotifications.subscribe(handleNotification)
}

export function stopVeillerJSCrashloopReportService(): void {
  unsubscribe?.()
  unsubscribe = null
}
