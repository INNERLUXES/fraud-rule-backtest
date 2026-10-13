// Writes the made-up transactions of the examples, with a seeded random generator so the same files come out every time:
//   examples/good/transactions.csv and transactions.jsonl   about four hundred made-up transactions with a confirmed label
//   examples/bad/transactions.csv                           the same kind of file with mistakes in it
//   examples/bad/transactions-small.csv                     a short file with few fraud cases
//   examples/bad/transactions-no-label.csv                  a file with no label column
//   examples/bad/transactions-one-sided.csv                 a file where no transaction is fraud
// Every transaction is made up. The fraud cases are planted in groups that the rules of the examples are written for, so that the
// examples show every kind of result. Timestamps are seconds since the epoch. Run it with `npm run make-examples` and commit the
// files; the tests read the committed files and never run this script.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// A small seeded generator (mulberry32), so the output never changes.
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = generator(7);
const pick = (list) => list[Math.floor(rng() * list.length)];
const between = (lo, hi) => lo + rng() * (hi - lo);
const money = (x) => x.toFixed(2);
const score = (fraud) => (fraud ? 0.35 + 0.6 * rng() : 0.02 + 0.5 * rng() * rng()).toFixed(3);

const COUNTRIES = ['DE', 'FR', 'NL', 'ES', 'IT', 'PL'];
const SHOPS = ['grocery', 'electronics', 'travel', 'fashion', 'gaming', 'food', 'gift_cards'];
const CHANNELS = ['web', 'app', 'pos'];
const customer = () => `C${String(1 + Math.floor(rng() * 80)).padStart(3, '0')}`;
const device = () => `D${String(1 + Math.floor(rng() * 120)).padStart(3, '0')}`;

const rows = [];
const add = (n, fraud, make) => {
  for (let i = 0; i < n; i += 1) rows.push({ fraud, ...make() });
};

// Good transactions that none of the rules of the examples fire on.
add(337, 0, () => {
  const country = rng() < 0.06 ? 'BR' : pick(COUNTRIES);
  const shop = pick(SHOPS);
  let amount = 5 + rng() * rng() * 240;
  if (shop === 'gift_cards') amount = Math.min(amount, 190);
  if (country === 'BR') amount = Math.min(amount, 150);
  return { amount, channel: pick(CHANNELS), country, shop };
});
// Gift cards of a large value (rule R001): fraud and good.
add(8, 1, () => ({ amount: between(300, 800), channel: pick(CHANNELS), country: pick(COUNTRIES), shop: 'gift_cards' }));
add(3, 0, () => ({ amount: between(300, 700), channel: pick(CHANNELS), country: pick(COUNTRIES), shop: 'gift_cards' }));
add(1, 1, () => ({ amount: between(250, 299), channel: pick(CHANNELS), country: pick(COUNTRIES), shop: 'gift_cards' }));
add(2, 0, () => ({ amount: between(250, 259), channel: pick(CHANNELS), country: pick(COUNTRIES), shop: 'gift_cards' }));
// Web payments from two countries (rule R002).
add(9, 1, () => ({ amount: between(100, 600), channel: 'web', country: pick(['NG', 'RU']), shop: pick(['electronics', 'travel', 'gaming']) }));
add(4, 0, () => ({ amount: between(100, 500), channel: 'web', country: pick(['NG', 'RU']), shop: pick(['electronics', 'travel', 'fashion']) }));
add(1, 1, () => ({ amount: between(80, 99), channel: 'web', country: pick(['NG', 'RU']), shop: 'electronics' }));
add(2, 0, () => ({ amount: between(80, 99), channel: 'web', country: pick(['NG', 'RU']), shop: 'fashion' }));
// Very small payments in the app, a card test (rule R003).
add(7, 1, () => ({ amount: between(0.5, 3), channel: 'app', country: pick(COUNTRIES), shop: pick(['gaming', 'food']) }));
add(8, 0, () => ({ amount: between(0.5, 3), channel: 'app', country: pick(COUNTRIES), shop: pick(['gaming', 'food', 'grocery']) }));
// Very high amounts (rule R004); some of them also from the two countries, so two rules catch them.
add(5, 1, () => ({ amount: between(900, 1400), channel: pick(['web', 'app']), country: pick(COUNTRIES), shop: pick(['electronics', 'travel']) }));
add(4, 1, () => ({ amount: between(900, 1200), channel: 'web', country: pick(['NG', 'RU']), shop: 'electronics' }));
// Large payments in the app from one country (rule R005 of the candidate).
add(6, 1, () => ({ amount: between(200, 800), channel: 'app', country: 'BR', shop: pick(['electronics', 'fashion']) }));
add(2, 0, () => ({ amount: between(200, 400), channel: 'app', country: 'BR', shop: 'fashion' }));
// Fraud that no rule catches.
add(6, 1, () => ({ amount: between(20, 150), channel: 'web', country: pick(['DE', 'FR']), shop: 'electronics' }));

// Shuffle with the generator, then give the rows ids and times in order.
for (let i = rows.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rng() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}
let time = 1700000000;
const good = rows.map((r, i) => {
  time += 60 + Math.floor(rng() * 1500);
  return {
    id: `T${String(i + 1).padStart(4, '0')}`,
    timestamp: String(time),
    amount: money(r.amount),
    currency: 'EUR',
    customer_id: customer(),
    channel: r.channel,
    country: r.country,
    device_id: device(),
    merchant_category: r.shop,
    score: score(r.fraud === 1),
    is_fraud: String(r.fraud)
  };
});

const FIELDS = ['id', 'timestamp', 'amount', 'currency', 'customer_id', 'channel', 'country', 'device_id', 'merchant_category', 'score', 'is_fraud'];
const csv = (data, fields = FIELDS) => `${[fields.join(','), ...data.map((r) => fields.map((f) => r[f]).join(','))].join('\n')}\n`;
const jsonl = (data) => `${data.map((r) => JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, ['amount', 'score', 'timestamp'].includes(f) ? Number(r[f]) : f === 'is_fraud' ? Number(r[f]) : r[f]])))).join('\n')}\n`;

// The file with mistakes: the good file with a few rows changed.
const bad = good.map((r) => ({ ...r }));
bad[10].amount = '-25.00';
bad[20].amount = '12 EUR';
bad[30].is_fraud = 'maybe';
bad[40].is_fraud = '';
bad[50].currency = 'GBP';
bad[60].timestamp = 'soon';
bad[70].id = bad[69].id;
bad[80].timestamp = '4102444800';
bad[90].amount = '';

const small = good.slice(0, 70).map((r, i) => ({ ...r, is_fraud: i === 12 || i === 40 || i === 55 ? '1' : '0' }));
const noLabel = good.slice(0, 40);
const oneSided = good.slice(0, 40).map((r) => ({ ...r, is_fraud: '0' }));

await mkdir(resolve(root, 'examples/good'), { recursive: true });
await mkdir(resolve(root, 'examples/bad'), { recursive: true });
await writeFile(resolve(root, 'examples/good/transactions.csv'), csv(good));
await writeFile(resolve(root, 'examples/good/transactions.jsonl'), jsonl(good));
await writeFile(resolve(root, 'examples/bad/transactions.csv'), csv(bad));
await writeFile(resolve(root, 'examples/bad/transactions-small.csv'), csv(small));
await writeFile(resolve(root, 'examples/bad/transactions-no-label.csv'), csv(noLabel, FIELDS.filter((f) => f !== 'is_fraud')));
await writeFile(resolve(root, 'examples/bad/transactions-one-sided.csv'), csv(oneSided));
console.log(`wrote ${good.length} transactions, ${good.filter((r) => r.is_fraud === '1').length} of them fraud`);
