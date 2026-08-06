#!/usr/bin/env bun
/**
 * Soniox Token Processing Validation Test
 * 
 * This test monitors transcription output from the remote cloud to validate
 * that our Soniox token processing improvements are working correctly.
 * 
 * We'll look for patterns that indicate the fixes are working:
 * - No overlapping segments like "to ten." → "en. O" → "en. One,"
 * - Proper interim → final flow
 * - No truncated words
 * - Clean endpoint detection
 */

import { resolve } from 'path';
import { VeillerClient } from '../VeillerClient';
import { AccountService } from '../services/AccountService';

const LIVE_CAPTIONS_PACKAGE = 'com.veiller.livecaptions';
const AUDIO_FILE_PATH = resolve(__dirname, '../audio/short-test.wav');

interface TranscriptionEvent {
  text: string;
  timestamp: number;
  isFinal?: boolean;
  source: 'display' | 'direct';
}

const transcriptionHistory: TranscriptionEvent[] = [];
let duplicateCount = 0;
let overlapCount = 0;
let truncatedWordCount = 0;

async function main() {
  console.log('🔍 Soniox Token Processing Validation Test');
  console.log('🎯 Testing against: testapi.mentra.glass');
  console.log('🔧 Validating our token processing improvements\n');

  // Get test account
  const accountService = new AccountService();
  const account = accountService.getDefaultTestAccount();

  // Create client
  const client = new VeillerClient({
    email: account.email,
    coreToken: account.coreToken,
    serverUrl: process.env.DEFAULT_SERVER_URL || 'wss://testapi.mentra.glass/glasses-ws',
    debug: {
      logLevel: 'info',
      logWebSocketMessages: false // Reduce noise to focus on transcriptions
    },
    behavior: {
      // Disable automatic core status updates to avoid remote cloud errors
      disableStatusUpdates: true
    }
  });

  // Setup transcription monitoring
  setupTranscriptionMonitoring(client);

  try {
    // Step 1: Connect
    console.log('📡 Connecting to remote cloud...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Step 2: Test if Live Captions can start
    console.log('🔧 Testing Live Captions app availability...');
    try {
      // Try to stop first
      try {
        await client.stopApp(LIVE_CAPTIONS_PACKAGE);
      } catch (e) {
        // Ignore
      }

      // Try to install
      try {
        await client.installApp(LIVE_CAPTIONS_PACKAGE);
        console.log('✅ App installed successfully');
      } catch (error: any) {
        if (error.message.includes('already installed')) {
          console.log('ℹ️  App already installed');
        } else {
          throw error;
        }
      }

      // Try to start with shorter timeout
      console.log('🚀 Starting Live Captions...');
      await Promise.race([
        client.startApp(LIVE_CAPTIONS_PACKAGE),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]);
      console.log('✅ App started successfully\n');

      // Wait for app to initialize
      await sleep(3000);

      // Step 3: Stream audio and monitor transcription quality
      console.log('🎤 Starting audio stream for transcription analysis...');
      console.log('👀 Monitoring for token processing issues...\n');
      
      // Start monitoring
      const monitoringPromise = monitorTranscriptionQuality();
      
      // Stream audio
      await client.startSpeakingFromFile(AUDIO_FILE_PATH);
      console.log('✅ Audio streaming completed');
      
      // Wait for transcription to finish
      console.log('⏳ Waiting for transcription to complete...');
      await sleep(8000);
      
      // Stop monitoring and analyze results
      clearTimeout(monitoringPromise);
      analyzeTranscriptionQuality();

    } catch (error: any) {
      if (error.message.includes('Timeout') || error.message.includes('failed to start')) {
        console.log('⚠️  Live Captions app unavailable, testing direct audio stream...\n');
        
        // Test direct audio streaming without app
        console.log('🎤 Testing direct audio streaming...');
        await testDirectAudioStream(client);
      } else {
        throw error;
      }
    }

    // Step 4: Disconnect
    console.log('\n👋 Disconnecting...');
    await client.disconnect();
    console.log('✅ Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

function setupTranscriptionMonitoring(client: VeillerClient) {
  // Monitor display events for transcription results
  client.on('display_event', (event) => {
    const text = event.layout?.textData?.text || event.layout?.text;
    if (!text || typeof text !== 'string') return;
    
    // Only track transcription-related text
    if (text.trim().length < 2) return;
    if (text.includes('Starting App') || text.includes('Veiller')) return;
    
    console.log(`📝 Transcription: "${text}"`);
    
    recordTranscription({
      text: text.trim(),
      timestamp: Date.now(),
      source: 'display'
    });
  });

  // Monitor any other transcription data
  client.on('data_stream', (event) => {
    if (event.streamType === 'transcription') {
      console.log(`🎙️  Direct Transcription: "${event.data.text}" (${event.data.isFinal ? 'FINAL' : 'interim'})`);
      
      recordTranscription({
        text: event.data.text,
        timestamp: Date.now(),
        isFinal: event.data.isFinal,
        source: 'direct'
      });
    }
  });

  // Log connection events
  client.on('error', (error) => {
    console.error('❌ Client Error:', error);
  });
}

function recordTranscription(event: TranscriptionEvent) {
  transcriptionHistory.push(event);
  
  // Check for immediate issues with the last few transcriptions
  if (transcriptionHistory.length >= 2) {
    const current = transcriptionHistory[transcriptionHistory.length - 1];
    const previous = transcriptionHistory[transcriptionHistory.length - 2];
    
    // Check for duplicates
    if (current.text === previous.text && Math.abs(current.timestamp - previous.timestamp) < 2000) {
      duplicateCount++;
      console.log(`🚨 DUPLICATE detected: "${current.text}"`);
    }
    
    // Check for overlapping patterns (like "to ten." → "en. O")
    if (current.text.length > 3 && previous.text.length > 3) {
      const overlap = findTextOverlap(previous.text, current.text);
      if (overlap.length > 3 && current.text !== previous.text) {
        overlapCount++;
        console.log(`🚨 OVERLAP detected: "${previous.text}" → "${current.text}" (overlap: "${overlap}")`);
      }
    }
    
    // Check for truncated words (like "syst" instead of "system")
    const words = current.text.split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord && lastWord.length <= 3 && !lastWord.match(/^(a|an|the|is|to|of|and|or|in|on|at|be|do|go|up|we|me|my|us|it|so|no|ok|yes)$/i)) {
      truncatedWordCount++;
      console.log(`🚨 TRUNCATED word detected: "${lastWord}" in "${current.text}"`);
    }
  }
}

function findTextOverlap(text1: string, text2: string): string {
  // Find overlapping substring between end of text1 and start of text2
  let maxOverlap = '';
  const minLength = Math.min(text1.length, text2.length);
  
  for (let i = 1; i <= minLength; i++) {
    const suffix = text1.slice(-i).toLowerCase();
    const prefix = text2.slice(0, i).toLowerCase();
    
    if (suffix === prefix) {
      maxOverlap = text1.slice(-i);
    }
  }
  
  return maxOverlap;
}

function monitorTranscriptionQuality(): NodeJS.Timeout {
  // Set up periodic quality checks
  return setTimeout(() => {
    console.log('\n📊 Transcription monitoring active...');
  }, 5000);
}

function analyzeTranscriptionQuality() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 SONIOX TOKEN PROCESSING ANALYSIS RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\n📈 TRANSCRIPTION STATISTICS:`);
  console.log(`Total Transcriptions: ${transcriptionHistory.length}`);
  console.log(`Duplicate Segments: ${duplicateCount}`);
  console.log(`Overlapping Segments: ${overlapCount}`);
  console.log(`Truncated Words: ${truncatedWordCount}`);
  
  // Show transcription timeline
  if (transcriptionHistory.length > 0) {
    console.log(`\n📝 TRANSCRIPTION TIMELINE:`);
    transcriptionHistory.forEach((event, index) => {
      const timeOffset = index === 0 ? 0 : event.timestamp - transcriptionHistory[0].timestamp;
      console.log(`${String(index + 1).padStart(2)}) +${timeOffset}ms: "${event.text}"`);
    });
  }
  
  // Calculate quality score
  const totalIssues = duplicateCount + overlapCount + truncatedWordCount;
  const qualityScore = transcriptionHistory.length > 0 
    ? ((transcriptionHistory.length - totalIssues) / transcriptionHistory.length * 100) 
    : 100;
  
  console.log(`\n🎯 QUALITY SCORE: ${qualityScore.toFixed(1)}%`);
  
  if (totalIssues === 0 && transcriptionHistory.length > 0) {
    console.log('🎉 EXCELLENT: No token processing issues detected!');
    console.log('✅ Soniox improvements appear to be working correctly');
  } else if (qualityScore >= 80) {
    console.log('✅ GOOD: Minor issues detected, mostly working well');
  } else if (qualityScore >= 50) {
    console.log('⚠️  NEEDS IMPROVEMENT: Some token processing issues remain');
  } else {
    console.log('❌ POOR: Significant token processing issues detected');
    console.log('🔧 Our Soniox improvements may not be deployed or working');
  }
  
  console.log('\n🔍 WHAT TO LOOK FOR:');
  console.log('✅ Clean transcription flow without overlaps');
  console.log('✅ No duplicate segments');
  console.log('✅ Complete words (not truncated)');
  console.log('✅ Proper interim → final progression');
  console.log('='.repeat(60));
}

async function testDirectAudioStream(client: VeillerClient) {
  console.log('🎤 Testing direct audio streaming (without Live Captions app)...');
  console.log('📝 This will test core transcription functionality...\n');
  
  // Start monitoring
  const startTime = Date.now();
  
  try {
    await client.startSpeakingFromFile(AUDIO_FILE_PATH);
    console.log('✅ Direct audio streaming completed');
    
    // Wait a bit for any delayed transcriptions
    await sleep(5000);
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Test duration: ${duration}ms`);
    
    if (transcriptionHistory.length === 0) {
      console.log('⚠️  No transcriptions received - may need Live Captions app');
    } else {
      analyzeTranscriptionQuality();
    }
    
  } catch (error) {
    console.log('❌ Direct audio streaming failed:', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}