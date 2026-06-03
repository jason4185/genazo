import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

const CONFIG = {
  CONTRACT_ADDRESS: '0xC6c644F4B4df6c8105b461F07DC180fBB1128Dc1',
  FUNDED_PRIVATE_KEY: '0x2afff82ee65dadde965fe25a996799b042ebfd7fae003bcf6cf2205b8dfc4eaa',
  ADMIN_SESSION: 'genazo_admin_daily',
};

const DOCS_URLS = [
  'https://genazo-knowledge.netlify.app',
];

async function generateWithRetry(client, docsUrl, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[daily] Attempt ${attempt} of ${maxRetries}`);

      const hash = await client.writeContract({
        address: CONFIG.CONTRACT_ADDRESS,
        functionName: 'generate_daily_riddle',
        args: [CONFIG.ADMIN_SESSION, docsUrl],
        value: 0,
      });

      console.log('[daily] Sent:', hash);

      await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        retries: 100,
        interval: 5000,
      });

      await new Promise(r => setTimeout(r, 15000));

      const day = await client.readContract({
        address: CONFIG.CONTRACT_ADDRESS,
        functionName: 'get_day_number',
        args: [],
      });

      console.log('[daily] Done! Confirmed day:', day);
      return true;

    } catch(err) {
      console.error(`[daily] Attempt ${attempt} failed:`, err.message);

      if (attempt < maxRetries) {
        const waitHours = 2;
        console.log(`[daily] Waiting ${waitHours} hours before retry...`);
        console.log(`[daily] Next attempt at:`,
          new Date(Date.now() + waitHours * 60 * 60 * 1000).toLocaleTimeString());
        await new Promise(r => setTimeout(r, waitHours * 60 * 60 * 1000));
      }
    }
  }

  console.error('[daily] All 3 attempts failed.');
  console.error('[daily] Players will see yesterday riddle.');
  return false;
}

async function generateDailyRiddle() {
  console.log('[daily] Generating riddle for today...');
  const account = createAccount(CONFIG.FUNDED_PRIVATE_KEY);
  const client = createClient({ chain: studionet, account });

  const currentDay = await client.readContract({
    address: CONFIG.CONTRACT_ADDRESS,
    functionName: 'get_day_number',
    args: [],
  });
  const nextDay = (parseInt(currentDay) || 0) + 1;
  const docsUrl = DOCS_URLS[nextDay % DOCS_URLS.length];

  console.log('[daily] Day:', nextDay);
  console.log('[daily] Docs URL:', docsUrl);

  await generateWithRetry(client, docsUrl, 3);
}

generateDailyRiddle().catch(err => console.error('[daily] Fatal:', err.message));
