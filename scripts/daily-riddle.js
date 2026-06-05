import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const CONFIG = {
  CONTRACT_ADDRESS: '0xC78Aa0956823927bF264064De7bF2bA1F93Cf6a1',
  FUNDED_PRIVATE_KEY: process.env.FUNDED_PRIVATE_KEY
    || '0x2afff82ee65dadde965fe25a996799b042ebfd7fae003bcf6cf2205b8dfc4eaa',
  DOCS_URL: 'https://genazo-knowledge.netlify.app',
  ADMIN_SESSION: 'genazo_admin_daily',
};

const RETRY_DELAY = 10 * 60 * 1000; // 10 minutes
const MAX_RETRIES = 3;

// Track results for summary
const results = {
  1: null, 2: null, 3: null, 4: null, 5: null
};

async function sendTransaction(client, riddleNumber) {
  const hash = await client.writeContract({
    address: CONFIG.CONTRACT_ADDRESS,
    functionName: 'generate_daily_riddle',
    args: [
      CONFIG.ADMIN_SESSION,
      CONFIG.DOCS_URL,
      riddleNumber
    ],
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

async function isGenerationConcluded(client) {
  try {
    const result = await client.readContract({
      address: CONFIG.CONTRACT_ADDRESS,
      functionName: 'get_generation_status',
      args: [],
    });
    const status = typeof result === 'string' ? JSON.parse(result) : result;
    return status === true;
  } catch(err) {
    console.error('[check] Could not read status:', err.message);
    return false;
  }
}

async function retryRiddle(client, riddleNumber, attemptsLeft) {
  for (let attempt = 1; attempt <= attemptsLeft; attempt++) {
    if (await isGenerationConcluded(client)) {
      console.log(`[riddle ${riddleNumber}] Generation concluded by frontend. Stopping.`);
      return;
    }

    try {
      console.log(`[riddle ${riddleNumber}] 🔄 Retry attempt ${attempt} of ${attemptsLeft}`);
      await sendTransaction(client, riddleNumber);
      console.log(`[riddle ${riddleNumber}] ✅ Retry succeeded`);
      results[riddleNumber] = true;
      return;
    } catch(err) {
      console.error(`[riddle ${riddleNumber}] ❌ Retry ${attempt} failed:`, err.message);

      if (attempt < attemptsLeft) {
        const nextRetry = new Date(Date.now() + RETRY_DELAY);
        console.log(`[riddle ${riddleNumber}] Next retry at ${nextRetry.toLocaleTimeString()}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  console.error(`[riddle ${riddleNumber}] ❌ All retries exhausted`);
  results[riddleNumber] = false;
}

async function generateSequentially(client) {
  const retryPromises = [];

  for (let i = 1; i <= 5; i++) {
    if (await isGenerationConcluded(client)) {
      console.log(`[daily] Generation concluded by frontend. Stopping at riddle ${i}.`);
      break;
    }

    console.log(`\n[daily] ═══ Riddle ${i} of 5 ═══`);
    console.log(`[riddle ${i}] Starting now...`);

    try {
      await sendTransaction(client, i);
      console.log(`[riddle ${i}] ✅ Success — moving to next`);
      results[i] = true;

    } catch(err) {
      console.error(`[riddle ${i}] ❌ Failed:`, err.message);

      const retryTime = new Date(Date.now() + RETRY_DELAY);
      console.log(`[riddle ${i}] Scheduled retry at ${retryTime.toLocaleTimeString()}`);
      console.log(`[riddle ${i}] Moving to next riddle immediately...`);

      const retryPromise = (async () => {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        await retryRiddle(client, i, MAX_RETRIES - 1);
      })();

      retryPromises.push(retryPromise);
      results[i] = 'pending';
    }
  }

  if (retryPromises.length > 0) {
    console.log(`\n[daily] Initial pass complete.`);
    console.log(`[daily] ${retryPromises.length} riddle(s) have scheduled retries.`);
    console.log(`[daily] Waiting for retries to complete...`);
    await Promise.all(retryPromises);
  }
}

async function printSummary() {
  console.log('\n[daily] ═══ Final Summary ═══');
  let successful = 0;
  for (let i = 1; i <= 5; i++) {
    const icon   = results[i] === true ? '✅' : '❌';
    const status = results[i] === true
      ? 'Generated'
      : results[i] === false
        ? 'Failed all retries'
        : 'Unknown';
    console.log(`[daily] Riddle ${i}: ${icon} ${status}`);
    if (results[i] === true) successful++;
  }
  console.log(`\n[daily] ${successful} of 5 riddles ready for players`);
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
    const status = await client.readContract({
      address: CONFIG.CONTRACT_ADDRESS,
      functionName: 'get_generation_status',
      args: [],
    });
    const isDone = typeof status === 'string' ? JSON.parse(status) : status;

    if (isDone === true) {
      console.log('[daily] Generation already complete today. Skipping.');
      return true;
    }

    const result = await client.readContract({
      address: CONFIG.CONTRACT_ADDRESS,
      functionName: 'get_daily_riddle',
      args: [],
    });
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const riddles = parsed?.riddles || [];

    if (riddles.length >= 5) {
      console.log(`[daily] Already has ${riddles.length} riddles. Skipping.`);
      return true;
    }

    console.log(`[daily] ${riddles.length} riddles exist. Generating missing ones.`);
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

  const account = createAccount(CONFIG.FUNDED_PRIVATE_KEY);
  const client  = createClient({ chain: studionet, account });

  console.log('[daily] Checking if riddles already exist...');
  const alreadyDone = await alreadyGeneratedToday(client);

  if (alreadyDone) {
    console.log('[daily] Riddles already generated today. Exiting.');
    process.exit(0);
  }

  console.log('[daily] No riddles yet today. Generating...');
  console.log('[daily] Strategy:');
  console.log('[daily] - Generate riddles one by one sequentially');
  console.log('[daily] - If one fails move to next immediately');
  console.log('[daily] - Failed riddles retry after 10 min independently');
  console.log('[daily] - Up to 3 total attempts per riddle\n');

  await generateSequentially(client);

  const successful = await printSummary();

  await markComplete(client);

  if (successful === 0) {
    console.error('[daily] No riddles generated today.');
    process.exit(1);
  } else {
    console.log('[daily] Done! Players can play today.');
  }
}

main();
