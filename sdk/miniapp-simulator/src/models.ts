/**
 * Device models the simulator can emulate.
 *
 * Both halves come from the app's own source of truth — the capability profile
 * the phone sends to a miniapp in CONNECT_ACK, and the display profile the
 * scene pipeline wraps text against — so a miniapp reading
 * `session.capabilities.display` in the simulator reads exactly the numbers it
 * would read on hardware.
 */

import {evenRealitiesG2} from "../../../mobile/modules/engine/src/types/capabilities/even-realities-g2"
import {evenRealitiesG1} from "../../../mobile/modules/engine/src/types/capabilities/even-realities-g1"
import {G2_PROFILE} from "../../../mobile/modules/engine/src/utils/display/profiles/g2"
import {G1_PROFILE} from "../../../mobile/modules/engine/src/utils/display/profiles/g1"
import type {Capabilities} from "../../../mobile/modules/engine/src/types/hardware"
import type {DisplayProfile} from "../../../mobile/modules/engine/src/utils/display/profiles/types"
import type {SceneDisplayCapabilities} from "../../../mobile/modules/engine/src/utils/display/scene/index"
import type {GlassesModel} from "./glasses"

/**
 * Build the scene-pipeline capability block the same way `SceneRenderer`
 * does, so budgets/limits can't drift between simulator and phone.
 */
function sceneCapsFrom(caps: Capabilities, profile: DisplayProfile): SceneDisplayCapabilities {
  const display = caps.display
  if (!display) {
    return {
      width: 0,
      height: 0,
      canPosition: false,
      maxTextElements: 0,
      maxImageElements: 0,
      shapes: [],
      intensityLevels: 0,
      partialUpdate: false,
    }
  }
  return {
    width: display.width ?? display.resolution?.width ?? profile.displayWidthPx,
    height: display.height ?? display.resolution?.height ?? profile.displayHeightPx ?? 288,
    canPosition: display.canPosition === true,
    maxTextElements: display.maxTextElements ?? 6,
    maxImageElements: display.maxImageElements ?? 0,
    ...(display.maxImagePx ? {maxImagePx: display.maxImagePx} : {}),
    shapes: (display.shapes ?? []) as "rect"[],
    intensityLevels: display.intensityLevels ?? 2,
    partialUpdate: display.partialUpdate ?? false,
  }
}

function modelFrom(caps: Capabilities, profile: DisplayProfile): GlassesModel {
  return {
    name: caps.modelName,
    capabilities: caps as unknown as Record<string, unknown>,
    scene: sceneCapsFrom(caps, profile),
    profile,
  }
}

export const MODELS: Record<string, () => GlassesModel> = {
  g2: () => modelFrom(evenRealitiesG2, G2_PROFILE),
  g1: () => modelFrom(evenRealitiesG1, G1_PROFILE),
}

export const DEFAULT_MODEL = "g2"

export function resolveModel(name: string = DEFAULT_MODEL): GlassesModel {
  const factory = MODELS[name.toLowerCase()]
  if (!factory) {
    throw new Error(`Unknown glasses model "${name}". Known: ${Object.keys(MODELS).join(", ")}`)
  }
  return factory()
}
