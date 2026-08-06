import {NativeModule, registerWebModule} from "expo"

import type {
  VeillerPhotoReceiverModuleEvents,
  PhotoReceiverResult,
} from "./VeillerPhotoReceiver.types"

class VeillerPhotoReceiverModule extends NativeModule<VeillerPhotoReceiverModuleEvents> {
  async isSupported(): Promise<boolean> {
    return false
  }

  async startPhotoReceiver(): Promise<PhotoReceiverResult> {
    throw new Error("The photo receiver is only available in native apps.")
  }

  async stopPhotoReceiver(): Promise<void> {}
}

export default registerWebModule(VeillerPhotoReceiverModule, "VeillerPhotoReceiver")
