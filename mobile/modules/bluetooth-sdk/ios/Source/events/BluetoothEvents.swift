import Foundation

public struct ButtonPressEvent: CustomStringConvertible {
    public let buttonId: String
    public let pressType: String
    public let timestamp: Int?

    public init(buttonId: String, pressType: String, timestamp: Int? = nil) {
        self.buttonId = buttonId
        self.pressType = pressType
        self.timestamp = timestamp
    }

    public var description: String {
        "ButtonPressEvent(buttonId: \(buttonId), pressType: \(pressType))"
    }
}

public struct TouchEvent: CustomStringConvertible {
    public let values: [String: Any]

    public init(values: [String: Any]) {
        self.values = values
    }

    public var deviceModel: String? {
        stringValue(values, "deviceModel")
    }

    public var gestureName: String? {
        stringValue(values, "gestureName")
    }

    public var timestamp: Int? {
        intValue(values["timestamp"])
    }

    public var isSwipe: Bool {
        gestureName?.localizedCaseInsensitiveContains("swipe") == true
    }

    public var description: String {
        "TouchEvent(gestureName: \(gestureName ?? "unknown"))"
    }
}

public struct VoiceActivityDetectionStatusEvent: CustomStringConvertible {
    public let voiceActivityDetectionEnabled: Bool
    public let values: [String: Any]

    public init(values: [String: Any]) {
        voiceActivityDetectionEnabled =
            boolValue(values, "voiceActivityDetectionEnabled") ?? BluetoothSdkDefaults.voiceActivityDetectionEnabled
        self.values = values
    }

    public var description: String {
        "VoiceActivityDetectionStatusEvent(voiceActivityDetectionEnabled: \(voiceActivityDetectionEnabled))"
    }
}

public struct SpeakingStatusEvent: CustomStringConvertible {
    public let speaking: Bool
    public let values: [String: Any]

    public init(values: [String: Any]) {
        speaking = boolValue(values, "speaking") ?? false
        self.values = values
    }

    public var description: String {
        "SpeakingStatusEvent(speaking: \(speaking))"
    }
}

public struct OtaStartAckEvent: CustomStringConvertible {
    public let timestamp: Int?
    public let values: [String: Any]

    public init(values: [String: Any]) {
        timestamp = intValue(values["timestamp"])
        self.values = values
    }

    public var description: String {
        "OtaStartAckEvent(timestamp: \(timestamp.map(String.init) ?? "unknown"))"
    }
}

public struct OtaStatusEvent: CustomStringConvertible {
    public let sessionId: String
    public let totalSteps: Int
    public let currentStep: Int
    public let stepType: String
    public let phase: String
    public let stepPercent: Int
    public let overallPercent: Int
    public let status: String
    public let errorMessage: String?
    public let glassesTimeMs: Int?
    public let values: [String: Any]

    public init(values: [String: Any]) {
        sessionId = stringValue(values, "session_id") ?? ""
        totalSteps = intValue(values["total_steps"]) ?? 0
        currentStep = intValue(values["current_step"]) ?? 0
        stepType = stringValue(values, "step_type") ?? ""
        phase = stringValue(values, "phase") ?? ""
        stepPercent = intValue(values["step_percent"]) ?? 0
        overallPercent = intValue(values["overall_percent"]) ?? 0
        status = stringValue(values, "status") ?? ""
        errorMessage = stringValue(values, "error_message")
        glassesTimeMs = intValue(values["glasses_time_ms"])
        self.values = values
    }

    public var description: String {
        "OtaStatusEvent(status: \(status), overallPercent: \(overallPercent))"
    }
}

public struct OtaQueryResult: CustomStringConvertible {
    public let values: [String: Any]

    public init(values: [String: Any]) {
        self.values = values
    }

    public var type: String {
        stringValue(values, "type") ?? ""
    }

    public var status: String? {
        stringValue(values, "status")
    }

    public var description: String {
        "OtaQueryResult(type: \(type), status: \(status ?? "unknown"))"
    }
}

public struct SettingsAckEvent: CustomStringConvertible {
    public let values: [String: Any]

    public init(values: [String: Any]) {
        self.values = values
    }

    public var requestId: String {
        stringValue(values, "requestId") ?? ""
    }

    public var setting: String {
        stringValue(values, "setting") ?? ""
    }

    public var status: String {
        stringValue(values, "status") ?? "applied"
    }

    public var timestamp: Int {
        intValue(values["timestamp"]) ?? Int(Date().timeIntervalSince1970 * 1000)
    }

    public var fov: Int? {
        intValue(values["fov"])
    }

    public var roiPosition: Int? {
        intValue(values["roiPosition"]) ?? intValue(values["roi_position"])
    }

    public var hardwareApplied: Bool {
        boolValue(values, "hardwareApplied") ?? boolValue(values, "hardware_applied") ?? false
    }

    public var errorCode: String? {
        stringValue(values, "errorCode")
    }

    public var errorMessage: String? {
        stringValue(values, "errorMessage")
    }

    public var description: String {
        "SettingsAckEvent(setting: \(setting), status: \(status))"
    }
}

public struct RgbLedControlResponseEvent: CustomStringConvertible {
    public let values: [String: Any]

    public init(values: [String: Any]) {
        self.values = values
    }

    public var requestId: String {
        stringValue(values, "requestId") ?? ""
    }

    public var state: String {
        stringValue(values, "state") ?? "error"
    }

    public var errorCode: String? {
        stringValue(values, "errorCode")
    }

    public var description: String {
        "RgbLedControlResponseEvent(requestId: \(requestId), state: \(state))"
    }
}

public enum BluetoothEvent: CustomStringConvertible {
    case buttonPress(ButtonPressEvent)
    case touch(TouchEvent)
    case voiceActivityDetectionStatus(VoiceActivityDetectionStatusEvent)
    case speakingStatus(SpeakingStatusEvent)
    case wifiStatus(WifiStatusEvent)
    case hotspotStatus(HotspotStatusEvent)
    case hotspotError(HotspotErrorEvent)
    case photoResponse(PhotoResponseEvent)
    case photoStatus(PhotoStatusEvent)
    case cameraStatus(CameraStatusEvent)
    case videoRecordingStatus(VideoRecordingStatusEvent)
    case mediaUpload(MediaUploadEvent)
    case rgbLedControlResponse(RgbLedControlResponseEvent)
    case streamStatus(StreamStatusEvent)
    case keepAliveAck(KeepAliveAckEvent)
    case otaStartAck(OtaStartAckEvent)
    case otaStatus(OtaStatusEvent)
    case settingsAck(SettingsAckEvent)
    case versionInfo(VersionInfoResult)
    case localTranscription(LocalTranscriptionEvent)
    case raw(name: String, values: [String: Any])

    public var description: String {
        switch self {
        case let .buttonPress(event):
            event.description
        case let .touch(event):
            event.description
        case let .voiceActivityDetectionStatus(event):
            event.description
        case let .speakingStatus(event):
            event.description
        case let .wifiStatus(event):
            event.description
        case let .hotspotStatus(event):
            event.description
        case let .hotspotError(event):
            event.description
        case let .photoResponse(event):
            event.description
        case let .photoStatus(event):
            event.description
        case let .cameraStatus(event):
            event.description
        case let .videoRecordingStatus(event):
            event.description
        case let .mediaUpload(event):
            event.description
        case let .rgbLedControlResponse(event):
            event.description
        case let .streamStatus(event):
            event.description
        case let .keepAliveAck(event):
            event.description
        case let .otaStartAck(event):
            event.description
        case let .otaStatus(event):
            event.description
        case let .settingsAck(event):
            event.description
        case let .versionInfo(event):
            event.description
        case let .localTranscription(event):
            event.description
        case let .raw(name, values):
            "\(name): \(values)"
        }
    }
}

@MainActor
public protocol VeillerBluetoothSDKDelegate: AnyObject {
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didUpdate state: VeillerBluetoothState)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didUpdateGlasses glasses: GlassesRuntimeState)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didUpdateSdkState sdkState: PhoneSdkRuntimeState)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didUpdateScan scan: BluetoothScanState)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didDiscover device: Device)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didStopScan reason: ScanStopReason)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didReceive event: BluetoothEvent)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didReceiveMicPcm event: MicPcmEvent)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didReceiveMicLc3 event: MicLc3Event)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didChangeDefaultDevice device: Device?)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didLog message: String)
    func veillerBluetoothSDK(_ sdk: VeillerBluetoothSDK, didFail error: BluetoothSdkError)
}

@MainActor
public extension VeillerBluetoothSDKDelegate {
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didUpdate _: VeillerBluetoothState) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didUpdateGlasses _: GlassesRuntimeState) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didUpdateSdkState _: PhoneSdkRuntimeState) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didUpdateScan _: BluetoothScanState) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didDiscover _: Device) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didStopScan _: ScanStopReason) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didReceive _: BluetoothEvent) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didReceiveMicPcm _: MicPcmEvent) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didReceiveMicLc3 _: MicLc3Event) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didChangeDefaultDevice _: Device?) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didLog _: String) {}
    func veillerBluetoothSDK(_: VeillerBluetoothSDK, didFail _: BluetoothSdkError) {}
}
