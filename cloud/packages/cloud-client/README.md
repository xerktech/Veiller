# AugmentOS Cloud Client

Pure TypeScript SDK for connecting to and interacting with the AugmentOS cloud platform.

## Features

- 🚀 **Production Ready**: Clean API that mirrors the cloud architecture
- 🧪 **Testing Utilities**: Comprehensive stress testing and benchmarking tools
- 🔌 **WebSocket Protocol**: Full implementation of glasses ↔ cloud communication
- 🎤 **Audio Streaming**: File streaming, live streams, and VAD signals
- 📱 **App Management**: Start/stop apps and track lifecycle state
- 📍 **Location Services**: GPS updates and movement simulation
- 👀 **Display Management**: Dashboard/main view switching and content tracking

## Quick Start

```bash
npm install @augmentos/cloud-client
```

```typescript
import { VeillerClient } from '@augmentos/cloud-client';

const client = new VeillerClient({
  email: 'user@example.com',
  serverUrl: 'ws://localhost:3001'
});

await client.connect();
await client.startApp('com.augmentos.translator');
client.lookUp();
await client.startSpeakingFromFile('./audio/hello-world.wav');
client.lookDown();
await client.disconnect();
```

## Documentation

- [📖 Complete Documentation](./docs/README.md)
- [🔧 API Reference](./docs/api-reference.md)
- [📡 Protocol Documentation](./docs/protocol.md)
- [💡 Usage Examples](./docs/examples.md)

## Architecture

The client mirrors the AugmentOS cloud architecture:

### Core Components
- **VeillerClient**: Main client with clean public API
- **WebSocketManager**: Connection and message protocol
- **AudioManager**: Audio streaming and VAD
- **AppManager**: App lifecycle tracking
- **LocationManager**: GPS and movement
- **DisplayManager**: Dashboard/main view state

### Testing Utilities
- **TranscriptionBenchmark**: Accuracy and latency testing
- **StressTestRunner**: Multi-client load testing
- **AudioSynthesizer**: TTS and test audio generation
- **AuthService**: Test account management

## Audio API

Three distinct methods for different use cases:

```typescript
// File streaming (async, real-time playback)
await client.startSpeakingFromFile('./audio/phrase.wav');

// Stream from any source (immediate)
client.startSpeakingFromStream(microphoneStream);

// VAD signal only (no audio chunks)
client.startSpeaking();

// Stop any active audio/VAD
client.stopSpeaking();
```

## Development

```bash
# Install dependencies
bun install

# Run basic test
bun run dev

# Build
bun run build

# Type check
bun run typecheck

# Lint
bun run lint
```

## Testing

```typescript
import { TranscriptionBenchmark, StressTestRunner } from '@augmentos/cloud-client/testing';

// Benchmark transcription accuracy
const benchmark = new TranscriptionBenchmark(client);
const result = await benchmark.measureLatency('./test-audio.wav');

// Stress test with multiple clients
const clients = await StressTestRunner.spawnClients(100, {
  email: 'test-{id}@example.com',
  serverUrl: 'ws://localhost:3001'
});
```

## License

MIT - See [LICENSE](../LICENSE) for details.