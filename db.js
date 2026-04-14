const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'food-platform.db');

let db;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createSchema();
  seedIfEmpty();
  save();

  return db;
}

function save() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS offices (
      id INTEGER PRIMARY KEY,
      name TEXT,
      address TEXT,
      budget_per_order REAL DEFAULT 15.00,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY,
      name TEXT,
      cuisine TEXT,
      delivery_time_min INTEGER,
      active INTEGER DEFAULT 1,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER,
      name TEXT,
      description TEXT,
      price REAL,
      category TEXT,
      dietary_tags TEXT,
      available INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY,
      office_id INTEGER,
      name TEXT,
      email TEXT,
      role TEXT DEFAULT 'employee',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      employee_id INTEGER,
      office_id INTEGER,
      restaurant_id INTEGER,
      status TEXT DEFAULT 'placed',
      total REAL,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      menu_item_id INTEGER,
      quantity INTEGER,
      unit_price REAL
    );
  `);
}

function seedIfEmpty() {
  const result = db.exec('SELECT COUNT(*) as count FROM offices');
  const count = result[0].values[0][0];
  if (count > 0) return;

  const now = new Date().toISOString();

  // Offices
  db.run(`INSERT INTO offices (name, address, budget_per_order, created_at) VALUES
    ('Tech Corp HQ', '100 Tech Blvd, San Francisco, CA', 20.00, ?),
    ('Design Studio', '200 Creative Ave, Oakland, CA', 18.00, ?)`,
    [now, now]);

  // Restaurants
  db.run(`INSERT INTO restaurants (name, cuisine, delivery_time_min, active, created_at) VALUES
    ('The Burger Joint', 'American', 25, 1, ?),
    ('Green Bowl', 'Healthy/Vegan', 20, 1, ?),
    ('Sakura Sushi', 'Japanese', 35, 1, ?)`,
    [now, now, now]);

  // Menu items for The Burger Joint (id=1)
  db.run(`INSERT INTO menu_items (restaurant_id, name, description, price, category, dietary_tags, available) VALUES
    (1, 'Classic Burger', 'Beef patty with lettuce, tomato, and cheese', 12.99, 'Burgers', '', 1),
    (1, 'Veggie Burger', 'Plant-based patty with all the fixings', 11.99, 'Burgers', 'vegetarian', 1),
    (1, 'Bacon Cheeseburger', 'Double beef patty with bacon and cheese', 14.99, 'Burgers', '', 1),
    (1, 'Sweet Potato Fries', 'Crispy sweet potato fries', 4.99, 'Sides', 'vegan,gluten-free', 1),
    (1, 'Onion Rings', 'Golden battered onion rings', 4.49, 'Sides', 'vegetarian', 1),
    (1, 'Chocolate Shake', 'Thick chocolate milkshake', 5.99, 'Drinks', 'vegetarian', 1)`);

  // Menu items for Green Bowl (id=2)
  db.run(`INSERT INTO menu_items (restaurant_id, name, description, price, category, dietary_tags, available) VALUES
    (2, 'Buddha Bowl', 'Quinoa, roasted veggies, tahini dressing', 13.99, 'Bowls', 'vegan,gluten-free', 1),
    (2, 'Avocado Toast', 'Sourdough with smashed avocado and seeds', 10.99, 'Toast', 'vegan', 1),
    (2, 'Green Smoothie', 'Spinach, banana, almond milk, chia seeds', 6.99, 'Drinks', 'vegan,gluten-free', 1),
    (2, 'Lentil Soup', 'Hearty red lentil soup with spices', 8.99, 'Soups', 'vegan,gluten-free', 1),
    (2, 'Kale Caesar Salad', 'Kale with vegan caesar dressing and croutons', 12.49, 'Salads', 'vegetarian', 1),
    (2, 'Protein Power Bowl', 'Grilled chicken, brown rice, steamed broccoli', 14.99, 'Bowls', 'gluten-free', 1)`);

  // Menu items for Sakura Sushi (id=3)
  db.run(`INSERT INTO menu_items (restaurant_id, name, description, price, category, dietary_tags, available) VALUES
    (3, 'Salmon Sashimi', 'Fresh Atlantic salmon, 6 pieces', 14.99, 'Sashimi', 'gluten-free', 1),
    (3, 'Veggie Roll', 'Cucumber, avocado, pickled radish', 9.99, 'Rolls', 'vegan', 1),
    (3, 'Spicy Tuna Roll', 'Tuna with spicy mayo and cucumber', 12.99, 'Rolls', '', 1),
    (3, 'Miso Soup', 'Traditional miso with tofu and seaweed', 3.99, 'Soups', 'vegetarian', 1),
    (3, 'Edamame', 'Steamed salted soybeans', 4.99, 'Appetizers', 'vegan,gluten-free', 1)`);

  // Employees
  db.run(`INSERT INTO employees (office_id, name, email, role, created_at) VALUES
    (1, 'Alice Johnson', 'alice@techcorp.com', 'admin', ?),
    (1, 'Bob Smith', 'bob@techcorp.com', 'employee', ?),
    (1, 'Carol White', 'carol@techcorp.com', 'employee', ?),
    (2, 'David Lee', 'david@designstudio.com', 'admin', ?),
    (2, 'Eva Martinez', 'eva@designstudio.com', 'employee', ?)`,
    [now, now, now, now, now]);

  // Sample orders
  const orderDate = new Date().toISOString();

  // Order 1: Alice at Burger Joint
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (1, 1, 1, 'delivered', 17.98, 'No onions please', ?)`, [orderDate]);
  const o1 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 1, 1, 12.99), (?, 4, 1, 4.99)`, [o1, o1]);

  // Order 2: Bob at Green Bowl
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (2, 1, 2, 'delivered', 13.99, '', ?)`, [orderDate]);
  const o2 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 7, 1, 13.99)`, [o2]);

  // Order 3: Carol at Sakura Sushi
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (3, 1, 3, 'preparing', 22.98, '', ?)`, [orderDate]);
  const o3 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 13, 1, 14.99), (?, 16, 1, 3.99), (?, 17, 1, 4.99)`, [o3, o3, o3]);

  // Order 4: David at Burger Joint
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (4, 2, 1, 'delivered', 20.97, '', ?)`, [orderDate]);
  const o4 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 3, 1, 14.99), (?, 4, 1, 4.99)`, [o4, o4]);

  // Order 5: Eva at Green Bowl
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (5, 2, 2, 'confirmed', 20.98, 'Extra tahini', ?)`, [orderDate]);
  const o5 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 7, 1, 13.99), (?, 9, 1, 6.99)`, [o5, o5]);

  // Order 6: Alice at Sakura Sushi
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (1, 1, 3, 'placed', 22.98, '', ?)`, [orderDate]);
  const o6 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 15, 1, 12.99), (?, 13, 1, 14.99)`, [o6, o6]);

  // Order 7: Bob at Sakura Sushi
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (2, 1, 3, 'delivered', 14.98, '', ?)`, [orderDate]);
  const o7 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 14, 1, 9.99), (?, 17, 1, 4.99)`, [o7, o7]);

  // Order 8: Carol at Green Bowl
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (3, 1, 2, 'cancelled', 8.99, '', ?)`, [orderDate]);
  const o8 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 10, 1, 8.99)`, [o8]);

  // Order 9: David at Green Bowl
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (4, 2, 2, 'delivered', 14.99, '', ?)`, [orderDate]);
  const o9 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 12, 1, 14.99)`, [o9]);

  // Order 10: Eva at Burger Joint
  db.run(`INSERT INTO orders (employee_id, office_id, restaurant_id, status, total, notes, created_at) VALUES (5, 2, 1, 'delivered', 17.48, 'Well done burger', ?)`, [orderDate]);
  const o10 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  save();
  db.run(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, 2, 1, 11.99), (?, 5, 1, 4.49), (?, 6, 1, 0)`, [o10, o10, o10]);
}

function getDb() {
  return db;
}

module.exports = { initDb, save, getDb };
