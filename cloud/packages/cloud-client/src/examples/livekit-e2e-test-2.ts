import { VeillerClient } from "../VeillerClient";
import { AccountService } from "../services/AccountService";
import { resolve } from "path";
import * as fs from "fs";

const APP_PACKAGE_NAME = "com.isaiah.recorder";

async function main() {
  const server = process.env.SERVER_URL || "https://isaiah.augmentos.cloud";
  const wsServer = server.replace(/^http/, "ws");
  const email = process.env.TEST_EMAIL || "user@example.com";
  const token =
    process.env.CORE_TOKEN ||
    AccountService.generateTestAccount(email).coreToken;

  console.log("🎯 End-to-End LiveKit Audio Test");
  console.log("================================");
  console.log("Server:", server);
  console.log("Email:", email);
  console.log();

  const client = new VeillerClient({
    email,
    serverUrl: `${wsServer}`,
    coreToken: token,
    behavior: {
      disableStatusUpdates: true,
      useLiveKitAudio: true, // Enable LiveKit audio transport
    },
    debug: { logLevel: "info", logWebSocketMessages: false },
  });

  client.on("connection_ack", (data) => {
    console.log("✅ CONNECTION_ACK received");
    if (data.livekit) {
      console.log("   LiveKit URL:", data.livekit.url);
      console.log("   Room:", data.livekit.roomName);
    }
  });

  client.on("livekit_connected", () => {
    console.log("✅ LiveKit connected to Go bridge");
  });

  // No transcription wait in this test (Recorder app saves audio only)

  client.on("error", (error) => {
    console.error("❌ Error:", error);
  });

  // Connect to server
  console.log("1️⃣  Connecting to server...");
  await client.connect();

  // Wait for LiveKit
  console.log("2️⃣  Waiting for LiveKit connection...");
  // Give bridge + room some time to fully establish
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Install and start transcription app
  console.log("3️⃣  Setting up Live Captions app...");
  try {
    await client.installApp(APP_PACKAGE_NAME);
    console.log("App installed");
  } catch (e) {
    console.log("App already installed", e);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    await client.stopApp(APP_PACKAGE_NAME);
  } catch {
    // ignore.
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await client.startApp(APP_PACKAGE_NAME);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("   ✅ App started");

  // Send audio file with VAD signaling (lets cloud authorize and process speech)
  console.log("4️⃣  Sending audio file via LiveKit bridge...");
  // const wavPath = resolve(__dirname, '../audio/long-test-audio.wav');
  const wavPath = resolve(__dirname, "../audio/short-test-16khz.wav");

  if (!fs.existsSync(wavPath)) {
    console.error("❌ Audio file not found:", wavPath);
    process.exit(1);
  }

  // Stream via client helper which sets VAD on/off and streams at proper cadence
  // Stream file (client should route to Go bridge when useLiveKitAudio=true)
  await client.startSpeakingFromFile(wavPath, true);
  console.log("   ✅ Audio streaming triggered");

  // Optional brief settle
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Stop the Recorder app now to force immediate finalize of recording
  try {
    console.log("6️⃣  Stopping Recorder app to finalize recording...");
    await client.stopApp(APP_PACKAGE_NAME);
    console.log("✅ Recorder app stopped");
  } catch (e) {
    console.log("⚠️  Failed to stop Recorder app (may already be stopped)", e);
  }

  // Disconnect
  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
