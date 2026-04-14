const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, save, getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: run a SELECT and return array of row objects
function query(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a SELECT expecting one row
function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

// Helper: run a write and return last insert rowid BEFORE saving
function run(sql, params = []) {
  const db = getDb();
  db.run(sql, params);
  const rowId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  return rowId;
}

// ─── Offices ───────────────────────────────────────────────────────────────

// GET /api/offices
app.get('/api/offices', (req, res) => {
  const offices = query('SELECT * FROM offices ORDER BY id');
  res.json(offices);
});

// ─── Restaurants ───────────────────────────────────────────────────────────

// GET /api/restaurants?cuisine=
app.get('/api/restaurants', (req, res) => {
  const { cuisine } = req.query;
  let sql = 'SELECT * FROM restaurants WHERE active = 1';
  const params = [];
  if (cuisine) {
    sql += ' AND cuisine LIKE ?';
    params.push(`%${cuisine}%`);
  }
  sql += ' ORDER BY id';
  const restaurants = query(sql, params);
  res.json(restaurants);
});

// GET /api/restaurants/:id/menu?dietary=&all=1
app.get('/api/restaurants/:id/menu', (req, res) => {
  const { id } = req.params;
  const { dietary, all } = req.query;

  let sql = all
    ? 'SELECT * FROM menu_items WHERE restaurant_id = ?'
    : 'SELECT * FROM menu_items WHERE restaurant_id = ? AND available = 1';
  const params = [parseInt(id)];

  if (dietary) {
    sql += ' AND dietary_tags LIKE ?';
    params.push(`%${dietary}%`);
  }

  sql += ' ORDER BY category, name';
  const items = query(sql, params);
  res.json(items);
});

// ─── Menu Items ─────────────────────────────────────────────────────────────

// POST /api/menu-items
app.post('/api/menu-items', (req, res) => {
  const { restaurant_id, name, description, price, category, dietary_tags, available = 1 } = req.body;

  if (!restaurant_id || !name || price == null) {
    return res.status(400).json({ error: 'restaurant_id, name, and price are required' });
  }

  const id = run(
    `INSERT INTO menu_items (restaurant_id, name, description, price, category, dietary_tags, available)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [restaurant_id, name, description || '', price, category || '', dietary_tags || '', available ? 1 : 0]
  );

  const item = queryOne('SELECT * FROM menu_items WHERE id = ?', [id]);
  res.status(201).json(item);
});

// PATCH /api/menu-items/:id
app.patch('/api/menu-items/:id', (req, res) => {
  const { id } = req.params;
  const existing = queryOne('SELECT * FROM menu_items WHERE id = ?', [parseInt(id)]);
  if (!existing) return res.status(404).json({ error: 'Menu item not found' });

  const { name, description, price, category, dietary_tags, available } = req.body;

  const updated = {
    name: name !== undefined ? name : existing.name,
    description: description !== undefined ? description : existing.description,
    price: price !== undefined ? price : existing.price,
    category: category !== undefined ? category : existing.category,
    dietary_tags: dietary_tags !== undefined ? dietary_tags : existing.dietary_tags,
    available: available !== undefined ? (available ? 1 : 0) : existing.available,
  };

  const db = getDb();
  db.run(
    `UPDATE menu_items SET name=?, description=?, price=?, category=?, dietary_tags=?, available=? WHERE id=?`,
    [updated.name, updated.description, updated.price, updated.category, updated.dietary_tags, updated.available, parseInt(id)]
  );
  save();

  const item = queryOne('SELECT * FROM menu_items WHERE id = ?', [parseInt(id)]);
  res.json(item);
});

// DELETE /api/menu-items/:id
app.delete('/api/menu-items/:id', (req, res) => {
  const { id } = req.params;
  const existing = queryOne('SELECT * FROM menu_items WHERE id = ?', [parseInt(id)]);
  if (!existing) return res.status(404).json({ error: 'Menu item not found' });

  const db = getDb();
  db.run('DELETE FROM menu_items WHERE id = ?', [parseInt(id)]);
  save();

  res.json({ message: 'Menu item deleted' });
});

// ─── Employees ──────────────────────────────────────────────────────────────

// GET /api/employees?office_id=
app.get('/api/employees', (req, res) => {
  const { office_id } = req.query;
  let sql = 'SELECT * FROM employees';
  const params = [];
  if (office_id) {
    sql += ' WHERE office_id = ?';
    params.push(parseInt(office_id));
  }
  sql += ' ORDER BY id';
  const employees = query(sql, params);
  res.json(employees);
});

// ─── Orders ─────────────────────────────────────────────────────────────────

// GET /api/orders?employee_id=&office_id=&restaurant_id=&status=
app.get('/api/orders', (req, res) => {
  const { employee_id, office_id, restaurant_id, status } = req.query;

  let sql = 'SELECT o.*, e.name as employee_name, r.name as restaurant_name FROM orders o LEFT JOIN employees e ON o.employee_id = e.id LEFT JOIN restaurants r ON o.restaurant_id = r.id WHERE 1=1';
  const params = [];

  if (employee_id) { sql += ' AND o.employee_id = ?'; params.push(parseInt(employee_id)); }
  if (office_id) { sql += ' AND o.office_id = ?'; params.push(parseInt(office_id)); }
  if (restaurant_id) { sql += ' AND o.restaurant_id = ?'; params.push(parseInt(restaurant_id)); }
  if (status) { sql += ' AND o.status = ?'; params.push(status); }

  sql += ' ORDER BY o.id DESC';

  const orders = query(sql, params);

  // Attach items to each order
  const result = orders.map(order => {
    const items = query(
      `SELECT oi.*, mi.name as item_name FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = ?`,
      [order.id]
    );
    return { ...order, items };
  });

  res.json(result);
});

// POST /api/orders
app.post('/api/orders', (req, res) => {
  const { employee_id, office_id, restaurant_id, notes, items } = req.body;

  if (!employee_id || !office_id || !restaurant_id || !items || !items.length) {
    return res.status(400).json({ error: 'employee_id, office_id, restaurant_id, and items are required' });
  }

  // Calculate total from menu item prices
  let total = 0;
  const resolvedItems = [];
  for (const item of items) {
    const menuItem = queryOne('SELECT * FROM menu_items WHERE id = ? AND available = 1', [item.menu_item_id]);
    if (!menuItem) {
      return res.status(400).json({ error: `Menu item ${item.menu_item_id} not found or unavailable` });
    }
    total += menuItem.price * item.quantity;
    resolvedItems.push({ ...item, unit_price: menuItem.price });
  }

  const now = new Date().toISOString();
  const orderId = run(
    `INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at)
     VALUES (?, ?, ?, 'placed', ?, ?, ?)`,
    [employee_id, office_id, restaurant_id, Math.round(total * 100) / 100, notes || '', now]
  );

  for (const item of resolvedItems) {
    const db = getDb();
    db.run(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)`,
      [orderId, item.menu_item_id, item.quantity, item.unit_price]
    );
  }
  save();

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
  const orderItems = query(
    `SELECT oi.*, mi.name as item_name FROM order_items oi
     LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  res.status(201).json({ ...order, items: orderItems });
});

// PATCH /api/orders/:id/status
app.patch('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['placed', 'confirmed', 'preparing', 'delivered', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const existing = queryOne('SELECT * FROM orders WHERE id = ?', [parseInt(id)]);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const db = getDb();
  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, parseInt(id)]);
  save();

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [parseInt(id)]);
  res.json(order);
});

// ─── Dashboard ──────────────────────────────────────────────────────────────

// GET /api/dashboard/stats
app.get('/api/dashboard/stats', (req, res) => {
  const totalOrders = queryOne(`SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled'`);
  const totalSpend = queryOne(`SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'`);
  const activeOrders = queryOne(`SELECT COUNT(*) as count FROM orders WHERE status IN ('placed','confirmed','preparing')`);

  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = queryOne(
    `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as spend FROM orders WHERE created_at LIKE ? AND status != 'cancelled'`,
    [`${today}%`]
  );

  const topRestaurants = query(
    `SELECT r.name, COUNT(o.id) as order_count, COALESCE(SUM(o.total), 0) as total_spend
     FROM restaurants r
     LEFT JOIN orders o ON r.id = o.restaurant_id AND o.status != 'cancelled'
     GROUP BY r.id, r.name
     ORDER BY order_count DESC
     LIMIT 5`
  );

  // Last 7 days
  const ordersByDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const row = queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as spend
       FROM orders WHERE created_at LIKE ? AND status != 'cancelled'`,
      [`${dayStr}%`]
    );
    ordersByDay.push({ date: dayStr, count: row.count, spend: row.spend });
  }

  const avgOrderValue = totalOrders.count > 0
    ? Math.round((totalSpend.total / totalOrders.count) * 100) / 100
    : 0;

  res.json({
    total_orders: totalOrders.count,
    total_spend: Math.round(totalSpend.total * 100) / 100,
    orders_today: ordersToday.count,
    spend_today: Math.round(ordersToday.spend * 100) / 100,
    active_orders: activeOrders.count,
    avg_order_value: avgOrderValue,
    top_restaurants: topRestaurants,
    orders_by_day: ordersByDay,
  });
});

// ─── Admin Extras ────────────────────────────────────────────────────────────

// PATCH /api/employees/:id
app.patch('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  const existing = queryOne('SELECT * FROM employees WHERE id = ?', [parseInt(id)]);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const { role } = req.body;
  const validRoles = ['employee', 'admin'];
  if (role !== undefined && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'role must be employee or admin' });
  }

  const db = getDb();
  db.run('UPDATE employees SET role = ? WHERE id = ?', [role ?? existing.role, parseInt(id)]);
  save();

  const emp = queryOne('SELECT * FROM employees WHERE id = ?', [parseInt(id)]);
  res.json(emp);
});

// GET /api/dashboard/employee-stats
app.get('/api/dashboard/employee-stats', (req, res) => {
  const rows = query(`
    SELECT e.id, e.name, e.email, e.role, e.office_id, off.name as office_name,
           COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END) as order_count,
           COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) as total_spend
    FROM employees e
    LEFT JOIN offices off ON e.office_id = off.id
    LEFT JOIN orders o ON o.employee_id = e.id
    GROUP BY e.id
    ORDER BY e.office_id, e.name
  `);
  res.json(rows);
});

// GET /api/dashboard/office-budgets
app.get('/api/dashboard/office-budgets', (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const rows = query(`
    SELECT off.id, off.name, off.budget_per_order,
           COUNT(CASE WHEN o.status != 'cancelled' THEN 1 END) as month_orders,
           COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) as month_spend,
           COUNT(CASE WHEN o.status IN ('placed','confirmed','preparing') THEN 1 END) as active_orders
    FROM offices off
    LEFT JOIN orders o ON o.office_id = off.id AND o.created_at >= ?
    GROUP BY off.id, off.name, off.budget_per_order
    ORDER BY off.id
  `, [monthStart]);
  res.json(rows);
});

// GET /api/restaurants/:id/stats
app.get('/api/restaurants/:id/stats', (req, res) => {
  const rid = parseInt(req.params.id);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const allTime = queryOne(
    `SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as orders FROM orders WHERE restaurant_id = ? AND status != 'cancelled'`,
    [rid]
  );
  const thisMonth = queryOne(
    `SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as orders FROM orders WHERE restaurant_id = ? AND status != 'cancelled' AND created_at >= ?`,
    [rid, monthStart]
  );

  const topItems = query(`
    SELECT mi.name, SUM(oi.quantity) as count, ROUND(SUM(oi.quantity * oi.unit_price), 2) as revenue
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN orders o ON oi.order_id = o.id
    WHERE mi.restaurant_id = ? AND o.status != 'cancelled'
    GROUP BY mi.id, mi.name
    ORDER BY count DESC
    LIMIT 10
  `, [rid]);

  const ordersByDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const row = queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
       FROM orders WHERE restaurant_id = ? AND created_at LIKE ? AND status != 'cancelled'`,
      [rid, `${dayStr}%`]
    );
    ordersByDay.push({ date: dayStr, count: row.count, revenue: row.revenue });
  }

  res.json({
    all_time_revenue: Math.round(allTime.revenue * 100) / 100,
    all_time_orders: allTime.orders,
    month_revenue: Math.round(thisMonth.revenue * 100) / 100,
    month_orders: thisMonth.orders,
    top_items: topItems,
    orders_by_day: ordersByDay,
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Office Food Platform API running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
