import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const CONFIG = {
  CONTRACT_ADDRESS: '0xEdcb1a5273b02a9a92F61634Ee462eC6f73048f6',
  FUNDED_PRIVATE_KEY: process.env.FUNDED_PRIVATE_KEY
    || '0x2afff82ee65dadde965fe25a996799b042ebfd7fae003bcf6cf2205b8dfc4eaa',
  DOCS_URL: 'https://genazo-knowledge.netlify.app',
  ADMIN_SESSION: 'genazo_admin_daily',
};

const RETRY_DELAY = 30 * 60 * 1000; // 30 minutes
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

async function retryRiddle(client, riddleNumber, attemptsLeft) {
  // This runs independently — does not block anything
  for (let attempt = 1; attempt <= attemptsLeft; attempt++) {
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
    console.log(`\n[daily] ═══ Riddle ${i} of 5 ═══`);
    console.log(`[riddle ${i}] Starting now...`);

    try {
      await sendTransaction(client, i);
      console.log(`[riddle ${i}] ✅ Success — moving to next`);
      results[i] = true;

    } catch(err) {
      console.error(`[riddle ${i}] ❌ Failed:`, err.message);

      // Schedule independent retry — does not block next riddle
      const retryTime = new Date(Date.now() + RETRY_DELAY);
      console.log(`[riddle ${i}] Scheduled retry at ${retryTime.toLocaleTimeString()}`);
      console.log(`[riddle ${i}] Moving to next riddle immediately...`);

      // Fire retry independently — does not block
      const retryPromise = (async () => {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        await retryRiddle(client, i, MAX_RETRIES - 1);
      })();

      retryPromises.push(retryPromise);
      results[i] = 'pending';
    }
  }

  // All 5 initial attempts done
  // Now wait for any pending retries to complete
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

async function main() {
  console.log('[daily] ═══════════════════════════════');
  console.log('[daily] Genazo Daily Riddle Generation');
  console.log('[daily] ═══════════════════════════════');
  console.log('[daily] Strategy:');
  console.log('[daily] - Generate riddles one by one sequentially');
  console.log('[daily] - If one fails move to next immediately');
  console.log('[daily] - Failed riddles retry after 30 min independently');
  console.log('[daily] - Up to 3 total attempts per riddle\n');

  const account = createAccount(CONFIG.FUNDED_PRIVATE_KEY);
  const client  = createClient({ chain: studionet, account });

  await generateSequentially(client);

  const successful = await printSummary();

  if (successful === 0) {
    console.error('[daily] No riddles generated today.');
    process.exit(1);
  } else {
    console.log('[daily] Done! Players can play today.');
  }
}

main();
