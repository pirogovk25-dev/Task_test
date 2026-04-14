require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const RETAILCRM_URL = process.env.RETAILCRM_URL;
const RETAILCRM_API_KEY = process.env.RETAILCRM_API_KEY;
const RETAILCRM_SITE = process.env.RETAILCRM_SITE || 'main';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadBatch(orders, site) {
  // Пробуем /api/v5/orders/upload (пакетная загрузка)
  const url = `${RETAILCRM_URL}/api/v5/orders/upload?apiKey=${RETAILCRM_API_KEY}`;
  const body = new URLSearchParams({ site, orders: JSON.stringify(orders) });

  console.log(`[DEBUG] POST ${url}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await response.text();
  // Показываем первый failedOrder с ошибками
  try {
    const parsed = JSON.parse(text);
    if (parsed.failedOrders && parsed.failedOrders.length > 0) {
      console.log(`[DEBUG] HTTP ${response.status} | failed: ${parsed.failedOrders.length}`);
      console.log('[DEBUG] Первая ошибка:', JSON.stringify(parsed.failedOrders[0], null, 2));
    } else {
      console.log(`[DEBUG] HTTP ${response.status}: ${text.substring(0, 500)}`);
    }
  } catch {
    console.log(`[DEBUG] HTTP ${response.status}: ${text.substring(0, 500)}`);
  }

  try { return { status: response.status, data: JSON.parse(text) }; }
  catch { return { status: response.status, data: { success: false, errorMsg: text } }; }
}

async function main() {
  if (!RETAILCRM_URL || !RETAILCRM_API_KEY) {
    console.error('Ошибка: заполните RETAILCRM_URL и RETAILCRM_API_KEY в .env');
    process.exit(1);
  }

  const site = RETAILCRM_SITE;
  console.log(`Site code: "${site}"\n`);

  const ordersPath = path.join(__dirname, '..', 'mock_orders.json');
  const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf-8'));

  // --- Тест с минимальным заказом ---
  console.log('Тест: отправляем минимальный заказ без orderType...');
  const testResult = await uploadBatch([{
    externalId: 'test-min-001',
    firstName:  'Тест',
    lastName:   'Тестов',
    phone:      '+77001110000',
    status:     'new',
  }], site);

  if (testResult.data.uploadedOrders?.length > 0) {
    console.log('✓ Минимальный заказ прошёл — проблема была в orderType или items\n');
  } else {
    console.log('✗ Минимальный заказ тоже не прошёл');
    console.log('Детали:', JSON.stringify(testResult.data, null, 2));
    process.exit(1);
  }

  // Добавляем externalId/number если нет, считаем totalSumm, убираем orderType
  const enriched = orders.map((order, i) => {
    const num = String(i + 1).padStart(3, '0');
    const { orderType, ...rest } = order; // убираем orderType
    const o = {
      externalId: rest.externalId || `mock-${num}`,
      number:     rest.number     || `ORD-${num}`,
      ...rest,
    };
    if (!o.totalSumm && o.items) {
      o.totalSumm = o.items.reduce(
        (sum, item) => sum + (item.initialPrice || 0) * (item.quantity || 1), 0
      );
    }
    return o;
  });

  console.log(`Загружаем ${enriched.length} заказов в RetailCRM (пакетно)...\n`);

  // Загружаем по 50 штук за раз
  const BATCH = 50;
  let uploaded = 0;
  for (let i = 0; i < enriched.length; i += BATCH) {
    const batch = enriched.slice(i, i + BATCH);
    const result = await uploadBatch(batch, site);
    if (result.data.success) {
      const count = result.data.uploadedOrders?.length || batch.length;
      console.log(`✓ Загружено ${count} заказов`);
      uploaded += count;
    } else {
      console.error(`✗ Ошибка: ${result.data.errorMsg || JSON.stringify(result.data)}`);
    }
    await sleep(300);
  }

  console.log(`\nГотово: ${uploaded} загружено.`);
}

main();
