#!/usr/bin/env bun
/**
 * Quick Soniox Validation Test
 * 
 * This test quickly validates that our core status update fix is working
 * against the remote cloud without doing heavy audio streaming.
 */

import { VeillerClient } from '../VeillerClient';
import { AccountService } from '../services/AccountService';

const LIVE_CAPTIONS_PACKAGE = 'com.veiller.livecaptions';

async function main() {
  console.log('🔍 Quick Soniox Validation Test');
  console.log('🎯 Testing against: testapi.mentra.glass');
  console.log('🛠️  Validating core status update fix\n');

  // Get test account
  const accountService = new AccountService();
  const account = accountService.getDefaultTestAccount();

  // Create client with status updates disabled
  const client = new VeillerClient({
    email: account.email,
    coreToken: account.coreToken,
    serverUrl: process.env.DEFAULT_SERVER_URL || 'wss://testapi.mentra.glass/glasses-ws',
    debug: {
      logLevel: 'info',
      logWebSocketMessages: false
    },
    behavior: {
      // This should prevent the core status update errors
      disableStatusUpdates: true
    }
  });

  // Track any errors
  let errorCount = 0;
  const errors: string[] = [];

  client.on('error', (error) => {
    errorCount++;
    console.error('❌ Client Error:', error.message);
    errors.push(error.message);
  });

  try {
    // Step 1: Connect and wait
    console.log('📡 Connecting to remote cloud...');
    await client.connect();
    console.log('✅ Connected successfully');

    // Step 2: Wait for 30 seconds to see if we get any core status errors
    console.log('⏳ Monitoring for core status update errors for 30 seconds...');
    await sleep(30000);

    // Step 3: Try to interact with Live Captions without streaming audio
    console.log('🔧 Testing basic app operations...');
    
    try {
      // Try to stop first
      try {
        await client.stopApp(LIVE_CAPTIONS_PACKAGE);
        console.log('✅ Stop app operation successful');
      } catch (e) {
        console.log('ℹ️  App was not running');
      }

      // Try to install
      try {
        await client.installApp(LIVE_CAPTIONS_PACKAGE);
        console.log('✅ Install app operation successful');
      } catch (error: any) {
        if (error.message.includes('already installed')) {
          console.log('ℹ️  App already installed');
        } else {
          throw error;
        }
      }

      // Try brief VAD signals without audio
      console.log('🎤 Testing brief VAD signals...');
      client.startSpeaking();
      await sleep(2000);
      client.stopSpeaking();
      console.log('✅ VAD test completed');

    } catch (error: any) {
      console.log('⚠️  App operations failed:', error.message);
    }

    // Step 4: Wait a bit more to see if delayed errors occur
    console.log('⏳ Waiting for any delayed errors...');
    await sleep(10000);

    // Step 5: Disconnect
    console.log('👋 Disconnecting...');
    await client.disconnect();
    console.log('✅ Test completed!');

    // Results
    console.log('\n' + '='.repeat(50));
    console.log('📊 VALIDATION RESULTS');
    console.log('='.repeat(50));
    
    if (errorCount === 0) {
      console.log('🎉 SUCCESS: No core status update errors detected!');
      console.log('✅ The disableStatusUpdates fix appears to be working');
    } else {
      console.log(`❌ ERRORS DETECTED: ${errorCount} errors occurred`);
      console.log('🔧 Errors may indicate the fix needs adjustment');
      
      // Show unique errors
      const uniqueErrors = [...new Set(errors)];
      uniqueErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    // Check for specific core status errors
    const coreStatusErrors = errors.filter(error => 
      error.includes('core_info') || 
      error.includes('settings from core status') ||
      error.includes('core status')
    );
    
    if (coreStatusErrors.length === 0) {
      console.log('✅ No core status related errors - fix is working!');
    } else {
      console.log(`❌ ${coreStatusErrors.length} core status errors still occurring`);
    }
    
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}