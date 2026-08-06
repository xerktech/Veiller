import { VeillerClient } from "../VeillerClient";
import { AccountService } from "../services/AccountService";

async function main() {
  const server = process.env.SERVER_URL || "https://isaiah.augmentos.cloud";
  const wsServer = server.replace(/^http/, "ws");
  const email = process.env.TEST_EMAIL || "user@example.com";
  const token =
    process.env.CORE_TOKEN ||
    AccountService.generateTestAccount(email).coreToken;

  console.log("🚀 Testing LiveKit connection...");
  console.log("Server:", server);

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
      console.log("✅ LiveKit info present:", {
        url: data.livekit.url,
        room: data.livekit.roomName,
        hasToken: !!data.livekit.token,
      });
    }
  });

  client.on("livekit_connected", () => {
    console.log("✅ LiveKit connected successfully!");
  });

  client.on("error", (error) => {
    console.error("❌ Error:", error);
  });

  console.log("Connecting to server...");
  await client.connect();

  console.log("Waiting for LiveKit to connect...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Send a simple test audio chunk
  console.log("Sending test audio data...");
  const testData = Buffer.alloc(1600, 0); // 100ms of silence at 16kHz

  // Check if LiveKit manager has the send method
  if (client.liveKitManager && client.liveKitManager.goBridge) {
    console.log("Sending audio via Go bridge...");
    client.liveKitManager.sendPcmChunk(testData);
    console.log("✅ Audio sent");
  } else {
    console.log("❌ Go bridge not connected");
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("Test complete!");
  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
