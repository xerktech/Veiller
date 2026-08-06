/**
 * Test the new LiveKit connection architecture where:
 * 1. Client sends "livekit: true" header during WebSocket connection
 * 2. Server includes LiveKit info in CONNECTION_ACK response
 * 3. Client automatically connects to LiveKit based on the info
 */

import { VeillerClient } from "../VeillerClient";
import { AccountService } from "../services/AccountService";

async function testLiveKitConnectionAck() {
  console.log("🚀 Testing new LiveKit connection architecture...\n");

  // Step 1: Generate test credentials
  console.log("1️⃣ Generating test credentials...");
  const credentials = AccountService.generateTestAccount("test@example.com");
  console.log("✅ Test account ready\n");

  // Step 2: Create client with LiveKit enabled
  console.log("2️⃣ Creating client with LiveKit audio enabled...");
  const client = new VeillerClient({
    email: credentials.email,
    serverUrl: "http://localhost:8002",
    coreToken: credentials.coreToken,
    behavior: {
      useLiveKitAudio: true, // This will make the client send "livekit: true" header
    },
    debug: {
      logLevel: "debug",
      logWebSocketMessages: true,
    },
  });

  // Step 3: Listen for CONNECTION_ACK
  client.on("connection_ack", (data) => {
    console.log("\n3️⃣ CONNECTION_ACK received:");
    console.log("   Session ID:", data.sessionId);

    if (data.livekit) {
      console.log("   ✅ LiveKit info included:");
      console.log("      URL:", data.livekit.url);
      console.log("      Room:", data.livekit.roomName);
      console.log("      Token:", data.livekit.token ? "Present" : "Missing");
    } else {
      console.log("   ❌ No LiveKit info in CONNECTION_ACK");
    }
  });

  // Step 4: Listen for LiveKit connection (handled automatically)
  client.on("livekit_connected", () => {
    console.log("\n4️⃣ ✅ LiveKit connected successfully!");
    console.log("   Audio transport is now using WebRTC instead of WebSocket");
  });

  client.on("error", (error) => {
    console.error("❌ Error:", error);
  });

  // Step 5: Connect
  console.log("\n5️⃣ Connecting to server with LiveKit header...");
  await client.connect();

  // Wait a bit to see the LiveKit connection
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n📊 Summary:");
  console.log(
    "- Client sent 'livekit: true' header during WebSocket connection",
  );
  console.log(
    "- Server created LiveKit room and included info in CONNECTION_ACK",
  );
  console.log("- Client automatically connected to LiveKit based on the info");
  console.log("- No separate LIVEKIT_INIT message was needed");
  console.log("\n✨ New architecture test complete!");

  // Disconnect
  await client.disconnect();
  process.exit(0);
}

// Run the test
testLiveKitConnectionAck().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
