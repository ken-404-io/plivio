/**
 * find-unpaid-subscriptions.ts
 *
 * Finds users whose PayMongo payment was credited but whose subscription was
 * never activated in the database.
 *
 * How it works:
 *   1. Loads all subscription_checkouts where status = 'pending' and a
 *      paymongo_ref exists (meaning a payment link was actually created).
 *   2. For each checkout, calls the PayMongo GET /links/:id endpoint to
 *      check the real payment status.
 *   3. Prints a table of affected users (paid on PayMongo, not in our DB).
 *   4. If --fix is passed as a CLI argument, activates each affected
 *      subscription automatically.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/find-unpaid-subscriptions.ts           # dry-run (list only)
 *   npx tsx scripts/find-unpaid-subscriptions.ts --fix     # list + activate
 */

import 'dotenv/config';
import https  from 'https';
import pg     from 'pg';

// ─── Database connection (mirrors src/config/db.ts) ───────────────────────────

const { Pool } = pg;
pg.types.setTypeParser(1082, (val: string) => val);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max:      3,
      ssl:      false,
    });

// ─── PayMongo helper ──────────────────────────────────────────────────────────

function paymongoGet(path: string): Promise<Record<string, unknown>> {
  const secret = process.env.PAYMONGO_SECRET_KEY ?? '';
  const auth   = Buffer.from(`${secret}:`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.paymongo.com',
        path:     `/v1${path}`,
        method:   'GET',
        headers:  { Authorization: `Basic ${auth}` },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if ((res.statusCode ?? 0) >= 400) {
              reject(new Error(`PayMongo ${res.statusCode}: ${data}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Invalid JSON from PayMongo: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── Activate subscription (mirrors subscriptionController.ts) ────────────────

async function activateSubscription(checkout: {
  id: string; user_id: string; plan: string;
  duration_days: number; email: string; username: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE subscription_checkouts SET status = 'paid' WHERE id = $1`,
      [checkout.id],
    );
    await client.query(
      `UPDATE subscriptions SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`,
      [checkout.user_id],
    );
    await client.query(
      `INSERT INTO subscriptions (user_id, plan, starts_at, expires_at, is_active)
       VALUES ($1, $2::plan_type, NOW(), NOW() + ($3 || ' days')::INTERVAL, TRUE)`,
      [checkout.user_id, checkout.plan, checkout.duration_days],
    );
    await client.query(
      `UPDATE users SET plan = $1::plan_type WHERE id = $2`,
      [checkout.plan, checkout.user_id],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const FIX_MODE = process.argv.includes('--fix');

interface PendingCheckout {
  id:            string;
  user_id:       string;
  plan:          string;
  duration_days: number;
  paymongo_ref:  string;
  amount_php:    string;
  created_at:    string;
  email:         string;
  username:      string;
}

async function main() {
  if (!process.env.PAYMONGO_SECRET_KEY) {
    console.error('❌  PAYMONGO_SECRET_KEY is not set. Add it to backend/.env');
    process.exit(1);
  }

  console.log('\n🔍  Querying database for pending checkouts with a PayMongo reference…\n');

  const { rows } = await pool.query<PendingCheckout>(
    `SELECT sc.id, sc.user_id, sc.plan, sc.duration_days, sc.paymongo_ref,
            sc.amount_php, sc.created_at, u.email, u.username
     FROM subscription_checkouts sc
     JOIN users u ON u.id = sc.user_id
     WHERE sc.status = 'pending'
       AND sc.paymongo_ref IS NOT NULL
     ORDER BY sc.created_at DESC`,
  );

  if (rows.length === 0) {
    console.log('✅  No pending checkouts found. All paid subscriptions are already activated.');
    await pool.end();
    return;
  }

  console.log(`Found ${rows.length} pending checkout(s). Checking each against PayMongo…\n`);

  const affected: PendingCheckout[] = [];
  const errors:   { id: string; err: string }[] = [];

  for (const row of rows) {
    process.stdout.write(`  Checking checkout ${row.id} (${row.email}) … `);
    try {
      const linkRes   = await paymongoGet(`/links/${row.paymongo_ref}`);
      const linkData  = linkRes.data as Record<string, unknown>;
      const attrs     = (linkData?.attributes as Record<string, unknown>) ?? {};
      const status    = attrs.status as string;

      if (status === 'paid') {
        console.log(`💰  PAID (link status: paid)`);
        affected.push(row);
      } else {
        console.log(`⏳  not paid yet (status: ${status})`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`⚠️   PayMongo error: ${msg}`);
      errors.push({ id: row.id, err: msg });
    }
  }

  console.log('\n' + '─'.repeat(72));

  if (affected.length === 0) {
    console.log('\n✅  No unactivated paid subscriptions found.');
  } else {
    console.log(`\n⚠️   ${affected.length} user(s) paid on PayMongo but subscription NOT activated:\n`);

    const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
    console.log(
      col('Username', 20) + col('Email', 30) + col('Plan', 10) +
      col('Amount', 10) + col('Paid At (checkout created)', 27),
    );
    console.log('─'.repeat(97));

    for (const r of affected) {
      console.log(
        col(r.username, 20) + col(r.email, 30) + col(r.plan, 10) +
        col(`₱${r.amount_php}`, 10) + r.created_at,
      );
    }

    if (FIX_MODE) {
      console.log('\n🔧  --fix mode: activating subscriptions now…\n');
      let ok = 0;
      let fail = 0;
      for (const r of affected) {
        process.stdout.write(`  Activating for ${r.email} (${r.plan}) … `);
        try {
          await activateSubscription(r);
          console.log('✅  done');
          ok++;
        } catch (err) {
          console.log(`❌  failed: ${(err as Error).message}`);
          fail++;
        }
      }
      console.log(`\n  Activated: ${ok}  |  Failed: ${fail}`);
    } else {
      console.log(
        '\n💡  Run with --fix to automatically activate these subscriptions:\n' +
        '      npx tsx scripts/find-unpaid-subscriptions.ts --fix\n',
      );
    }
  }

  if (errors.length > 0) {
    console.log(`\n⚠️   ${errors.length} checkout(s) could not be verified (PayMongo API errors):`);
    for (const e of errors) {
      console.log(`  • ${e.id}: ${e.err}`);
    }
  }

  console.log('');
  await pool.end();
}

main().catch((err: Error) => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
