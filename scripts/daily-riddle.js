import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { readFileSync, writeFileSync } from 'fs';

const CONFIG = {
  CONTRACT_ADDRESS: '0xf6D5Eb24b26F11c174dd852A65C33A1F99A90D9b',
  FUNDED_PRIVATE_KEY: process.env.FUNDED_PRIVATE_KEY
    || '0x2afff82ee65dadde965fe25a996799b042ebfd7fae003bcf6cf2205b8dfc4eaa',
  DOCS_URL: 'https://genazo-knowledge.netlify.app',
  ADMIN_SESSION: 'genazo_admin_daily',
};

const RETRY_DELAY = 10 * 60 * 1000; // 10 minutes
const MAX_RETRIES = 3;

function getTodayUTC() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // "2026-06-06"
}

function getLastRunDate() {
  try {
    const data = readFileSync('./last-run-date.txt', 'utf8');
    return data.trim();
  } catch(e) {
    return '';
  }
}

function saveLastRunDate(date) {
  try {
    writeFileSync('./last-run-date.txt', date);
    console.log('[daily] Saved run date:', date);
  } catch(e) {
    console.error('[daily] Could not save date:', e);
  }
}

async function sendTransaction(client, riddleNumber) {
  const hash = await client.writeContract({
    address: CONFIG.CONTRACT_ADDRESS,
    functionName: 'generate_daily_riddle',
    args: [CONFIG.ADMIN_SESSION, CONFIG.DOCS_URL, riddleNumber],
    value: 0,
  });

  console.log(`[riddle ${riddleNumber}] Sent: ${hash}`);

  await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 150,
    interval: 5000,
  });

  return hash;
}

async function generateRiddleWithRetry(client, riddleNumber) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[riddle ${riddleNumber}] Attempt ${attempt} of ${MAX_RETRIES}...`);
      await sendTransaction(client, riddleNumber);
      console.log(`[riddle ${riddleNumber}] ✅ Success`);
      return true;
    } catch(err) {
      console.error(`[riddle ${riddleNumber}] ❌ Attempt ${attempt} failed:`, err.message);

      if (attempt < MAX_RETRIES) {
        const nextRetry = new Date(Date.now() + RETRY_DELAY);
        console.log(`[riddle ${riddleNumber}] Retrying at ${nextRetry.toLocaleTimeString()}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  console.error(`[riddle ${riddleNumber}] ❌ All ${MAX_RETRIES} attempts failed`);
  return false;
}

async function generateAllRiddles(client) {
  const results = { 1: null, 2: null, 3: null, 4: null, 5: null };

  for (let i = 1; i <= 5; i++) {
    console.log(`\n[daily] ═══ Riddle ${i} of 5 ═══`);
    results[i] = await generateRiddleWithRetry(client, i);
  }

  console.log('\n[daily] ═══ Final Summary ═══');
  let successful = 0;
  for (let i = 1; i <= 5; i++) {
    const icon   = results[i] === true ? '✅' : '❌';
    const status = results[i] === true ? 'Generated' : 'Failed all retries';
    console.log(`[daily] Riddle ${i}: ${icon} ${status}`);
    if (results[i] === true) successful++;
  }
  console.log(`\n[daily] ${successful} of 5 riddles generated.`);

  return successful;
}

async function markComplete(client) {
  try {
    const hash = await client.writeContract({
      address: CONFIG.CONTRACT_ADDRESS,
      functionName: 'mark_generation_complete',
      args: [CONFIG.ADMIN_SESSION],
      value: 0,
    });
    await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      retries: 60,
      interval: 5000,
    });
    console.log('[daily] Generation marked complete');
  } catch(err) {
    console.error('[daily] Could not mark complete:', err.message);
  }
}

async function alreadyGeneratedToday(client) {
  try {
    const todayUTC    = getTodayUTC();
    const lastRunDate = getLastRunDate();

    console.log('[daily] Today UTC:', todayUTC);
    console.log('[daily] Last run date:', lastRunDate || '(none)');

    if (lastRunDate !== todayUTC) {
      console.log('[daily] New day detected:', todayUTC, '!= last run:', lastRunDate || '(none)');
      console.log('[daily] Proceeding to generate.');
      return false;
    }

    // Same day — check if already complete on-chain
    const riddleResult = await client.readContract({
      address: CONFIG.CONTRACT_ADDRESS,
      functionName: 'get_daily_riddle',
      args: [],
    });
    const riddleParsed = typeof riddleResult === 'string' ? JSON.parse(riddleResult) : riddleResult;
    const riddles      = riddleParsed?.riddles || [];

    const statusResult = await client.readContract({
      address: CONFIG.CONTRACT_ADDRESS,
      functionName: 'get_generation_status',
      args: [],
    });
    const isDone = typeof statusResult === 'string' ? JSON.parse(statusResult) : statusResult;

    if (isDone === true && riddles.length >= 5) {
      console.log('[daily] Already complete today with', riddles.length, 'riddles. Skipping.');
      return true;
    }

    if (riddles.length > 0 && riddles.length < 5) {
      console.log('[daily] Only', riddles.length, 'riddles exist. Generating missing ones.');
      return false;
    }

    return false;

  } catch(err) {
    console.error('[daily] Check failed:', err.message);
    return false;
  }
}

async function main() {
  console.log('[daily] ═══════════════════════════════');
  console.log('[daily] Genazo Daily Riddle Generation');
  console.log('[daily] ═══════════════════════════════');
  console.log('[daily] UTC Date:', getTodayUTC());

  const account = createAccount(CONFIG.FUNDED_PRIVATE_KEY);
  const client  = createClient({ chain: studionet, account });

  const alreadyDone = await alreadyGeneratedToday(client);

  if (alreadyDone) {
    console.log('[daily] Done for today. Exiting.');
    process.exit(0);
  }

  const successful = await generateAllRiddles(client);

  // Always mark complete so frontend knows generation is done,
  // even if not all 5 succeeded — players score on what was generated.
  await markComplete(client);

  // Save today's date so tomorrow we know a new day has started.
  // On GitHub Actions this file doesn't persist between runs,
  // so lastRunDate is always '' which always triggers generation.
  saveLastRunDate(getTodayUTC());

  if (successful === 0) {
    console.error('[daily] No riddles generated today.');
    process.exit(1);
  } else {
    console.log('[daily] Done! Players can play today.');
  }
}

main();
