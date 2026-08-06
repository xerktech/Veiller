import {Platform, type ImageSourcePropType} from "react-native"
import {DeviceTypes} from "@/../../cloud/packages/types/src"

// XERK-206/XERK-200: Veiller supports only the Even Realities G2 and the Tap
// Strap 2. The imagery for parked devices (Mentra Live/Display, AR99, the G1
// style/color variant set, onboarding art) has been removed from the bundle to
// slim the APK — restore the assets from git history alongside the device if
// one is revived. Parked devices render this generic glasses image instead.
const PARKED_GLASSES_IMAGE = require("../../assets/glasses/g1.png")

export const AR99_MODEL_OPTIONS = [
  {
    key: "xingyi_ar99",
    deviceModel: DeviceTypes.AR99,
    projectName: "AR99",
    manufacturerName: "Xingyi Intelligent",
    displayName: "Xingyi AR99",
    imageSource: PARKED_GLASSES_IMAGE,
  },
] as const

export type Ar99ModelOption = (typeof AR99_MODEL_OPTIONS)[number]
export type Ar99ProjectName = Ar99ModelOption["projectName"]

export const getAr99ModelOptionByProjectName = (projectName?: string | null): Ar99ModelOption | null => {
  const normalized = projectName?.trim().toUpperCase()
  if (!normalized) return null
  return AR99_MODEL_OPTIONS.find((option) => option.projectName === normalized) ?? null
}

export const getAr99DisplayName = (projectName?: string | null): string => {
  return getAr99ModelOptionByProjectName(projectName)?.displayName ?? "AR99"
}

export const getAr99ManufacturerName = (projectName?: string | null): string => {
  return getAr99ModelOptionByProjectName(projectName)?.manufacturerName ?? "AR99"
}

export const getAr99ImageSource = (projectName?: string | null): ImageSourcePropType => {
  return getAr99ModelOptionByProjectName(projectName)?.imageSource ?? PARKED_GLASSES_IMAGE
}

export const getGlassesImage = (glasses: string | null) => {
  switch (glasses) {
    case "Vuzix-z100":
    case "Vuzix Z100":
    case "Vuzix Ultralite":
      return require("../../assets/glasses/vuzix_z100.png")
    case "Mentra Mach1":
    case "Mach1":
      return require("../../assets/glasses/vuzix_z100.png")
    case "Mentra Live":
    case "mentra_live":
      return PARKED_GLASSES_IMAGE
    case "inmo_air":
      return require("../../assets/glasses/inmo_air.png")
    case "tcl_rayneo_x_two":
      return require("../../assets/glasses/tcl_rayneo_x_two.png")
    case "Vuzix_shield":
      return require("../../assets/glasses/vuzix_shield.png")
    case "Mentra Display":
      return PARKED_GLASSES_IMAGE
    case "Even Realities G1":
    case "evenrealities_g1":
    case "g1":
      return require("../../assets/glasses/g1.png")
    case "Even Realities G2":
    case "evenrealities_g2":
    case "g2":
      return require("../../assets/glasses/even_realities_g2/even_realities_g2.png")
    case DeviceTypes.NIMO:
    case "nimo":
      return require("../../assets/glasses/nimo.png")
    case DeviceTypes.AR99:
    case "ar99":
    case "AR99":
    case "Xingyi AR99":
      return PARKED_GLASSES_IMAGE
    case "virtual-wearable":
    case "Audio Wearable":
      return require("../../assets/glasses/audio_wearable.png")
    case DeviceTypes.SIMULATED:
      if (Platform.OS === "ios") {
        return require("../../assets/guide/iphone.png")
      } else {
        return require("../../assets/guide/android.png")
      }
    case "Brilliant Labs Frame":
    case "frame":
      return require("../../assets/glasses/frame.png")
    case "Even Realities R1":
      return require("../../assets/glasses/even_realities/r1/ring.png")
    default:
      // Unknown model names default to the one supported glasses, the G2.
      return require("../../assets/glasses/even_realities_g2/even_realities_g2.png")
  }
}

export const getEvenRealitiesG1Image = (
  _style?: string,
  _color?: string,
  _state: string = "wearing",
  _side: string = "l",
  _dark: boolean = false,
  _batteryLevel?: number,
) => {
  // The G1 is a parked device (XERK-206): its 82-image style/color/state
  // variant set (~12MB) was removed from the bundle (XERK-200). Every G1
  // record now renders the single generic G1 image; restore the variant map
  // from git history if the G1 is ever revived.
  return PARKED_GLASSES_IMAGE
}

export const getGlassesClosedImage = (glasses: string | null) => {
  switch (glasses) {
    case "g1":
    case "evenrealities_g1":
    case "Even Realities G1":
      return require("../../assets/guide/image_g1_case_closed.png")
    default:
      return getGlassesImage(glasses)
  }
}

export const getGlassesOpenImage = (glasses: string | null) => {
  switch (glasses) {
    case "g1":
    case "evenrealities_g1":
    case "Even Realities G1":
      return require("../../assets/guide/image_g1_pair.png")
    default:
      return getGlassesImage(glasses)
  }
}
