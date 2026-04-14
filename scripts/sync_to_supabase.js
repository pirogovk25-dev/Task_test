require('dotenv').config();
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const RETAILCRM_URL = process.env.RETAILCRM_URL;
const RETAILCRM_API_KEY = process.env.RETAILCRM_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function fetchOrdersFromCRM(page = 1) {
  const params = new URLSearchParams({
    apiKey: RETAILCRM_API_KEY,
    limit: '100',
    page: String(page),
  });

  const response = await fetch(`${RETAILCRM_URL}/api/v5/orders?${params}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(`RetailCRM API error: ${JSON.stringify(data.errors || data)}`);
  }

  return data;
}

function mapOrder(order) {
  const customer = order.customer || {};
  const customerName = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(' ') || customer.email || 'Без имени';

  return {
    crm_id: String(order.id || order.externalId),
    number: order.number || null,
    status: order.status || null,
    total_sum: order.totalSumm || 0,
    created_at: order.createdAt || null,
    customer_name: customerName,
    raw_data: order,
  };
}

async function main() {
  if (!RETAILCRM_URL || !RETAILCRM_API_KEY) {
    console.error('Ошибка: заполните RETAILCRM_URL и RETAILCRM_API_KEY в .env');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Ошибка: заполните SUPABASE_URL и SUPABASE_ANON_KEY в .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  console.log('Получаем заказы из RetailCRM...');

  let allOrders = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await fetchOrdersFromCRM(page);
    const orders = data.orders || [];
    allOrders = allOrders.concat(orders);

    totalPages = data.pagination?.totalPageCount || 1;
    console.log(`  Страница ${page}/${totalPages}: получено ${orders.length} заказов`);
    page++;
  } while (page <= totalPages);

  console.log(`\nВсего получено: ${allOrders.length} заказов`);
  console.log('Синхронизируем в Supabase...');

  const rows = allOrders.map(mapOrder);

  const { data: upserted, error } = await supabase
    .from('orders')
    .upsert(rows, { onConflict: 'crm_id' })
    .select('crm_id');

  if (error) {
    console.error('Ошибка Supabase:', error.message);
    process.exit(1);
  }

  console.log(`\nГотово: синхронизировано ${upserted ? upserted.length : rows.length} заказов.`);
}

main();
