require('dotenv').config();
const fetch = require('node-fetch');

const RETAILCRM_URL = process.env.RETAILCRM_URL;
const RETAILCRM_API_KEY = process.env.RETAILCRM_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const POLL_INTERVAL_MS = 60 * 1000;
const LARGE_ORDER_THRESHOLD = 50000;

const sentOrderIds = new Set();

async function fetchRecentOrders() {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const fromStr = twoMinutesAgo.toISOString().replace('T', ' ').substring(0, 19);

  const params = new URLSearchParams({
    apiKey: RETAILCRM_API_KEY,
    limit: '100',
    page: '1',
    'filter[createdAtFrom]': fromStr,
  });

  const response = await fetch(`${RETAILCRM_URL}/api/v5/orders?${params}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(`RetailCRM API error: ${JSON.stringify(data.errors || data)}`);
  }

  return data.orders || [];
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram API error: ${result.description}`);
  }
  return result;
}

async function checkOrders() {
  try {
    const orders = await fetchRecentOrders();

    for (const order of orders) {
      const orderId = String(order.id || order.externalId);

      if (sentOrderIds.has(orderId)) continue;

      if ((order.totalSumm || 0) > LARGE_ORDER_THRESHOLD) {
        const customer = order.customer || {};
        const customerName = [customer.firstName, customer.lastName]
          .filter(Boolean)
          .join(' ') || customer.email || 'Неизвестен';

        const message =
          `🔔 <b>Новый крупный заказ!</b>\n` +
          `Номер: ${order.number}\n` +
          `Сумма: ${order.totalSumm.toLocaleString('ru-RU')} ₸\n` +
          `Клиент: ${customerName}`;

        await sendTelegramMessage(message);
        sentOrderIds.add(orderId);
        console.log(`[${new Date().toISOString()}] Уведомление отправлено: заказ ${order.number} на ${order.totalSumm} ₸`);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Ошибка:`, err.message);
  }
}

async function main() {
  if (!RETAILCRM_URL || !RETAILCRM_API_KEY) {
    console.error('Ошибка: заполните RETAILCRM_URL и RETAILCRM_API_KEY в .env');
    process.exit(1);
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Ошибка: заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env');
    process.exit(1);
  }

  console.log(`Бот запущен. Порог уведомлений: ${LARGE_ORDER_THRESHOLD.toLocaleString('ru-RU')} ₸`);
  console.log(`Интервал опроса: ${POLL_INTERVAL_MS / 1000} секунд\n`);

  await checkOrders();
  setInterval(checkOrders, POLL_INTERVAL_MS);
}

main();
