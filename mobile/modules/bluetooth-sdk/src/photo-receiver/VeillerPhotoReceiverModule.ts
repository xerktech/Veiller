import {NativeModule, requireNativeModule} from "expo"

import type {
  VeillerPhotoReceiverModuleEvents,
  PhotoReceiverResult,
} from "./VeillerPhotoReceiver.types"

declare class VeillerPhotoReceiverModule extends NativeModule<VeillerPhotoReceiverModuleEvents> {
  isSupported(): Promise<boolean>
  startPhotoReceiver(): Promise<PhotoReceiverResult>
  stopPhotoReceiver(): Promise<void>
}

export default requireNativeModule<VeillerPhotoReceiverModule>("VeillerPhotoReceiver")
