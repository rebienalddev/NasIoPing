/**
 * Render Web Service Keep-Alive Ping Script (GitHub Actions 6-Hour Session)
 * ------------------------------------------------------------------------
 * This script runs inside a GitHub Actions runner for ~5.8 hours (350 minutes),
 * sending an HTTP GET ping request to `https://nasiobot.onrender.com/`
 * EXACTLY EVERY 5 MINUTES continuously.
 *
 * Why 5.8 Hours?
 * GitHub Actions allows jobs to run up to 6 hours for free. By keeping each
 * GitHub Actions job active for 5.8 hours, GitHub stays actively pinging
 * your Render service every 5 minutes non-stop!
 */

import { setTimeout } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

// Configuration
const TARGET_URL = 'https://nasiobot.onrender.com/';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds delay between retries

// Ping Interval: EXACTLY EVERY 5 MINUTES
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// GitHub Actions maximum session duration: 350 minutes (~5.8 hours)
const TOTAL_SESSION_DURATION_MS = 350 * 60 * 1000;

// Flags
const IS_SINGLE_SHOT = process.argv.includes('--single') || process.env.SINGLE === 'true';
const IS_LOOP_MODE = process.argv.includes('--loop') || process.env.LOOP === 'true';

/**
 * Format a Date object into a readable UTC timestamp string.
 * @returns {string} ISO timestamp
 */
function getFormattedTimestamp() {
  return new Date().toISOString();
}

/**
 * Record a ping result to `pings.json` database file for index.html UI dashboard.
 * @param {object} pingRecord 
 */
function recordPingToHistory(pingRecord) {
  const pingsFilePath = path.join(process.cwd(), 'pings.json');
  let history = [];

  try {
    if (fs.existsSync(pingsFilePath)) {
      const rawData = fs.readFileSync(pingsFilePath, 'utf8');
      history = JSON.parse(rawData);
    }
  } catch (err) {
    history = [];
  }

  history.push(pingRecord);

  // Maintain up to 1000 historical pings
  if (history.length > 1000) {
    history = history.slice(-1000);
  }

  try {
    fs.writeFileSync(pingsFilePath, JSON.stringify(history, null, 2), 'utf8');
    console.log(`[History] Logged ping #${history.length} to pings.json`);
  } catch (err) {
    console.error('[History Warning] Failed to write to pings.json:', err.message);
  }
}

/**
 * Helper function to execute a single ping attempt.
 * @param {number} attemptNumber - Current attempt number (1-indexed)
 * @returns {Promise<{ success: boolean, status: number | null, duration: number, error: Error | null }>}
 */
async function sendPing(attemptNumber) {
  const timestamp = getFormattedTimestamp();
  const startTime = performance.now();

  console.log(`\n--- [Attempt ${attemptNumber}] Ping request to ${TARGET_URL} ---`);
  console.log(`Timestamp     : ${timestamp}`);

  try {
    const response = await fetch(TARGET_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'RenderKeepAlivePing/1.0 (+https://github.com)'
      }
    });

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    const isSuccess = response.ok; // HTTP 200-299 status code

    console.log(`HTTP Status   : ${response.status} ${response.statusText}`);
    console.log(`Response Time : ${duration} ms`);
    console.log(`Result        : ${isSuccess ? 'SUCCESS' : 'FAILED (Non-2xx Status)'}`);

    const record = {
      id: `ping-${Date.now()}`,
      timestamp,
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: duration,
      success: isSuccess,
      targetUrl: TARGET_URL
    };

    recordPingToHistory(record);

    return {
      success: isSuccess,
      status: response.status,
      duration,
      error: isSuccess ? null : new Error(`HTTP ${response.status} ${response.statusText}`)
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    console.log(`HTTP Status   : N/A (Network / Request Error)`);
    console.log(`Response Time : ${duration} ms`);
    console.log(`Result        : FAILED (${error.message})`);

    const record = {
      id: `ping-${Date.now()}`,
      timestamp,
      status: null,
      statusText: 'ERR',
      responseTimeMs: duration,
      success: false,
      targetUrl: TARGET_URL,
      error: error.message
    };

    recordPingToHistory(record);

    return {
      success: false,
      status: null,
      duration,
      error
    };
  }
}

/**
 * Run a full ping cycle with retry attempts.
 * @returns {Promise<boolean>} True if ping succeeded, false if all retries failed.
 */
async function runPingCycle() {
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    lastResult = await sendPing(attempt);

    if (lastResult.success) {
      console.log(' STATUS: SUCCESS - Render service is active!');
      return true;
    }

    if (attempt <= MAX_RETRIES) {
      console.log(`[Retry Warning] Request failed. Retrying in ${RETRY_DELAY_MS / 1000}s... (${attempt}/${MAX_RETRIES} retries used)`);
      await setTimeout(RETRY_DELAY_MS);
    }
  }

  console.error(' STATUS: FAILED - All retries exhausted.');
  console.error(` Last Error: ${lastResult?.error?.message || 'Unknown error'}`);
  return false;
}

/**
 * Main execution controller.
 */
async function main() {
  console.log('====================================================');
  console.log('  RENDER SERVICE KEEP-ALIVE PINGER (GitHub Actions)');
  console.log('====================================================');
  console.log(`Target URL       : ${TARGET_URL}`);
  console.log(`Max Retries      : ${MAX_RETRIES}`);
  console.log(`Ping Interval    : EVERY 5 MINUTES`);
  console.log(`Session Window   : 5.8 HOURS (350 MINUTES)`);
  console.log('====================================================');

  if (IS_SINGLE_SHOT) {
    const success = await runPingCycle();
    process.exit(success ? 0 : 1);
  } else if (IS_LOOP_MODE) {
    console.log('[Info] Running continuously locally. Press Ctrl+C to stop.\n');
    await runPingCycle();
    while (true) {
      console.log(`\n[Timer] Next ping scheduled in 5 minutes (${new Date(Date.now() + PING_INTERVAL_MS).toLocaleTimeString()})...`);
      await setTimeout(PING_INTERVAL_MS);
      await runPingCycle();
    }
  } else {
    // GitHub Actions Long Session Mode: Runs for 5.8 hours, pinging EVERY 5 MINUTES
    const sessionStartTime = Date.now();
    let cycleCount = 0;
    let anyFailure = false;

    while (Date.now() - sessionStartTime <= TOTAL_SESSION_DURATION_MS) {
      cycleCount++;
      const nowStr = new Date().toLocaleTimeString();
      console.log(`\n>>> [Ping #${cycleCount} at ${nowStr}] <<<`);
      const success = await runPingCycle();

      if (!success) {
        anyFailure = true;
      }

      const elapsed = Date.now() - sessionStartTime;
      const remaining = TOTAL_SESSION_DURATION_MS - elapsed;

      if (remaining >= PING_INTERVAL_MS) {
        console.log(`\n[Timer] Waiting 5 minutes until next ping... (${Math.round(remaining / 60000)} min remaining in this 6-hour GitHub Actions job)`);
        await setTimeout(PING_INTERVAL_MS);
      } else {
        break;
      }
    }

    console.log('\n====================================================');
    console.log(` GITHUB JOB SESSION COMPLETE - Executed ${cycleCount} pings across 5.8 hours.`);
    console.log('====================================================');

    process.exit(anyFailure ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('\n[Unhandled Exception]', err);
  process.exit(1);
});