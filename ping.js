/**
 * Render Web Service Keep-Alive Ping Script (2-Link Edition)
 * -------------------------------------------------------------------
 * Pings TWO Render services every 5 minutes.
 *
 * Each URL:
 * - Gets its own HTTP GET request
 * - Has up to 3 retries
 * - Gets logged separately in pings.json
 * - Is synced to GitHub after every ping
 */

import { setTimeout } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ============================================================
// CONFIGURATION
// ============================================================

const TARGET_URLS = [
  'https://gambot-wgnn.onrender.com',
  'https://ipad-pdf.onrender.com'
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds

// Ping Interval: EXACTLY EVERY 5 MINUTES
const PING_INTERVAL_MS = 5 * 60 * 1000;

// GitHub Actions maximum session duration: 350 minutes
const TOTAL_SESSION_DURATION_MS = 350 * 60 * 1000;

// Flags
const IS_SINGLE_SHOT =
  process.argv.includes('--single') || process.env.SINGLE === 'true';

const IS_LOOP_MODE =
  process.argv.includes('--loop') || process.env.LOOP === 'true';

// ============================================================
// HELPERS
// ============================================================

/**
 * Format current time as UTC ISO timestamp.
 */
function getFormattedTimestamp() {
  return new Date().toISOString();
}

/**
 * Record a ping result to pings.json and sync it to GitHub.
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

  // Keep only the latest 1000 records
  if (history.length > 1000) {
    history = history.slice(-1000);
  }

  try {
    fs.writeFileSync(
      pingsFilePath,
      JSON.stringify(history, null, 2),
      'utf8'
    );

    console.log(
      `[History] Logged ${pingRecord.targetUrl} (#${history.length})`
    );

    // Sync to GitHub
    if (!IS_SINGLE_SHOT && !IS_LOOP_MODE) {
      try {
        const token = process.env.GITHUB_TOKEN;

        if (token) {
          execSync(
            'git config --global user.name "github-actions[bot]"'
          );

          execSync(
            'git config --global user.email "github-actions[bot]@users.noreply.github.com"'
          );

          execSync('git add pings.json');

          execSync(
            'git commit -m "Auto-log 5-min ping history [skip ci]" || true'
          );

          execSync(
            'git pull --rebase origin main || true'
          );

          execSync(
            'git push origin main || true'
          );

          console.log(
            '⚡ [Live Sync] Successfully pushed ping history to GitHub!'
          );
        }
      } catch (gitErr) {
        console.warn(
          '[Live Sync Warning] Git push skipped:',
          gitErr.message
        );
      }
    }
  } catch (err) {
    console.error(
      '[History Warning] Failed to write to pings.json:',
      err.message
    );
  }
}

/**
 * Execute a single ping attempt for one URL.
 */
async function sendPing(targetUrl, attemptNumber) {
  const timestamp = getFormattedTimestamp();
  const startTime = performance.now();

  console.log(
    `\n--- [Attempt ${attemptNumber}] Ping request ---`
  );
  console.log(`Target URL    : ${targetUrl}`);
  console.log(`Timestamp     : ${timestamp}`);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'RenderKeepAlivePing/1.0 (+https://github.com)'
      }
    });

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    const isSuccess = response.ok;

    console.log(
      `HTTP Status   : ${response.status} ${response.statusText}`
    );

    console.log(
      `Response Time : ${duration} ms`
    );

    console.log(
      `Result        : ${
        isSuccess ? 'SUCCESS' : 'FAILED (Non-2xx Status)'
      }`
    );

    const record = {
      id: `ping-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}`,
      timestamp,
      status: response.status,
      statusText: response.statusText,
      responseTimeMs: duration,
      success: isSuccess,
      targetUrl
    };

    recordPingToHistory(record);

    return {
      success: isSuccess,
      status: response.status,
      duration,
      error: isSuccess
        ? null
        : new Error(
            `HTTP ${response.status} ${response.statusText}`
          )
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    console.log(
      `HTTP Status   : N/A (Network / Request Error)`
    );

    console.log(
      `Response Time : ${duration} ms`
    );

    console.log(
      `Result        : FAILED (${error.message})`
    );

    const record = {
      id: `ping-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}`,
      timestamp,
      status: null,
      statusText: 'ERR',
      responseTimeMs: duration,
      success: false,
      targetUrl,
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
 * Run retries for ONE URL.
 */
async function pingUrl(targetUrl) {
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    lastResult = await sendPing(targetUrl, attempt);

    if (lastResult.success) {
      console.log(
        `✅ STATUS: SUCCESS - ${targetUrl} is active!`
      );

      return true;
    }

    if (attempt <= MAX_RETRIES) {
      console.log(
        `[Retry Warning] ${targetUrl} failed. ` +
        `Retrying in ${RETRY_DELAY_MS / 1000}s... ` +
        `(${attempt}/${MAX_RETRIES} retries used)`
      );

      await setTimeout(RETRY_DELAY_MS);
    }
  }

  console.error(
    `❌ STATUS: FAILED - ${targetUrl}`
  );

  console.error(
    `Last Error: ${lastResult?.error?.message || 'Unknown error'}`
  );

  return false;
}

/**
 * Ping ALL configured URLs.
 */
async function runPingCycle() {
  console.log('\n==============================================');
  console.log('          STARTING PING CYCLE');
  console.log('==============================================');

  let allSuccessful = true;

  for (const targetUrl of TARGET_URLS) {
    const success = await pingUrl(targetUrl);

    if (!success) {
      allSuccessful = false;
    }
  }

  console.log('\n==============================================');
  console.log(
    `PING CYCLE COMPLETE: ${
      allSuccessful ? 'ALL SUCCESSFUL' : 'SOME FAILED'
    }`
  );
  console.log('==============================================\n');

  return allSuccessful;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('====================================================');
  console.log('   RENDER SERVICE KEEP-ALIVE PINGER');
  console.log('   2-LINK INSTANT LIVE SYNC EDITION');
  console.log('====================================================');

  console.log('Target URLs:');

  TARGET_URLS.forEach((url, index) => {
    console.log(`  ${index + 1}. ${url}`);
  });

  console.log(`Max Retries      : ${MAX_RETRIES}`);
  console.log(`Ping Interval    : EVERY 5 MINUTES`);
  console.log(`Session Window   : 5.8 HOURS (350 MINUTES)`);

  console.log('====================================================');

  // ----------------------------------------------------------
  // SINGLE SHOT MODE
  // ----------------------------------------------------------

  if (IS_SINGLE_SHOT) {
    const success = await runPingCycle();

    process.exit(success ? 0 : 1);
  }

  // ----------------------------------------------------------
  // LOCAL LOOP MODE
  // ----------------------------------------------------------

  else if (IS_LOOP_MODE) {
    console.log(
      '[Info] Running continuously locally. Press Ctrl+C to stop.\n'
    );

    await runPingCycle();

    while (true) {
      console.log(
        `\n[Timer] Next ping scheduled in 5 minutes ` +
        `(${new Date(
          Date.now() + PING_INTERVAL_MS
        ).toLocaleTimeString()})...`
      );

      await setTimeout(PING_INTERVAL_MS);

      await runPingCycle();
    }
  }

  // ----------------------------------------------------------
  // GITHUB ACTIONS LONG SESSION MODE
  // ----------------------------------------------------------

  else {
    const sessionStartTime = Date.now();

    let cycleCount = 0;
    let anyFailure = false;

    while (
      Date.now() - sessionStartTime <=
      TOTAL_SESSION_DURATION_MS
    ) {
      cycleCount++;

      const nowStr = new Date().toLocaleTimeString();

      console.log(
        `\n>>> [Ping Cycle #${cycleCount} at ${nowStr}] <<<`
      );

      const success = await runPingCycle();

      if (!success) {
        anyFailure = true;
      }

      const elapsed = Date.now() - sessionStartTime;

      const remaining =
        TOTAL_SESSION_DURATION_MS - elapsed;

      if (remaining >= PING_INTERVAL_MS) {
        console.log(
          `\n[Timer] Waiting 5 minutes until next ping... ` +
          `(${Math.round(
            remaining / 60000
          )} min remaining)`
        );

        await setTimeout(PING_INTERVAL_MS);
      } else {
        break;
      }
    }

    console.log('\n====================================================');
    console.log(
      ` GITHUB JOB SESSION COMPLETE - ` +
      `Executed ${cycleCount} ping cycles across 5.8 hours.`
    );
    console.log('====================================================');

    process.exit(anyFailure ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('\n[Unhandled Exception]', err);
  process.exit(1);
});
