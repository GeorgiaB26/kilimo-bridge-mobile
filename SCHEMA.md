# Kilimo Bridge - Database Schema

**Database:** PostgreSQL (via Supabase)

---

## 📊 Core Tables

### users
User accounts (farmers, agents, admin, etc.)

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL,  -- 'farmer', 'agent', 'admin', 'coop', 'manager'
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `users_email_idx` on email (login speed)
- `users_role_idx` on role (filtering by role)

---

### farmers
Farmer profiles (extends users)

```sql
CREATE TABLE farmers (
  id BIGINT PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id),
  bio TEXT,
  location VARCHAR(255),
  acres DECIMAL(8,2),
  crops TEXT[],  -- array of crop names
  verified_at TIMESTAMP,
  bank_account VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `farmers_location_idx` on location (geographic queries)
- `farmers_verified_idx` on verified_at (filter verified)

---

### commodities
Agricultural products/commodities

```sql
CREATE TABLE commodities (
  id BIGINT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,  -- 'grains', 'vegetables', 'dairy', etc.
  description TEXT,
  price_per_unit DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KES',
  unit VARCHAR(20) NOT NULL,  -- 'kg', 'liter', 'bunch', etc.
  inventory BIGINT DEFAULT 0,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `commodities_category_idx` on category (filter by type)
- `commodities_name_idx` on name (search)

---

### orders
Customer orders

```sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  farmer_id BIGINT NOT NULL REFERENCES farmers(id),
  commodity_id BIGINT NOT NULL REFERENCES commodities(id),
  quantity DECIMAL(12,2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KES',
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'
  delivery_location VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `orders_farmer_id_idx` on farmer_id (get orders by farmer)
- `orders_status_idx` on status (filter by status)
- `orders_created_at_idx` on created_at (recent orders)

---

### deliveries
Delivery tracking

```sql
CREATE TABLE deliveries (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id),
  driver_id BIGINT REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'in_transit', 'delivered', 'failed'
  current_lat DECIMAL(10,8),
  current_lng DECIMAL(11,8),
  location_updated_at TIMESTAMP,
  estimated_arrival TIMESTAMP,
  actual_arrival TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `deliveries_status_idx` on status
- `deliveries_order_id_idx` on order_id
- `deliveries_created_at_idx` on created_at

---

### delivery_route
Delivery route history (for tracking live updates)

```sql
CREATE TABLE delivery_route (
  id BIGINT PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES deliveries(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `delivery_route_delivery_id_idx` on delivery_id (get route by delivery)
- `delivery_route_timestamp_idx` on timestamp (recent locations)

---

### payments
Payment records

```sql
CREATE TABLE payments (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KES',
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  payment_method VARCHAR(50) NOT NULL,  -- 'm_pesa', 'card', 'bank_transfer'
  reference VARCHAR(255),  -- external payment reference
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

**Indexes:**
- `payments_order_id_idx` on order_id
- `payments_status_idx` on status
- `payments_reference_idx` on reference (look up by external ID)

---

### projects
Programs/initiatives on the platform

```sql
CREATE TABLE projects (
  id BIGINT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',  -- 'active', 'completed', 'archived'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### imports
Data import records (for bulk uploads)

```sql
CREATE TABLE imports (
  id BIGINT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  imported_by BIGINT NOT NULL REFERENCES users(id),
  row_count BIGINT,
  status VARCHAR(50) DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

---

## 🔗 Relationships Diagram

```
users
  ├── farmers (1:1, user_id)
  ├── orders (1:many, farmer_id)
  ├── deliveries (1:many, driver_id)
  ├── payments (1:many, created_by)
  └── imports (1:many, imported_by)

commodities
  └── orders (1:many, commodity_id)

orders
  ├── deliveries (1:1, order_id)
  └── payments (1:1, order_id)

deliveries
  └── delivery_route (1:many, delivery_id)

projects
  └── created_by users (many:1)
```

---

## 📈 Key Metrics Queries

### Active Farmers
```sql
SELECT COUNT(*) as total_farmers, 
       COUNT(CASE WHEN verified_at IS NOT NULL THEN 1 END) as verified
FROM farmers;
```

### Orders This Week
```sql
SELECT COUNT(*) FROM orders 
WHERE created_at >= NOW() - INTERVAL '7 days';
```

### Revenue
```sql
SELECT SUM(amount) FROM payments 
WHERE status = 'completed';
```

### Pending Transactions
```sql
SELECT SUM(total_price) FROM orders 
WHERE status IN ('pending', 'confirmed');
```

---

## 🔐 Row Level Security (RLS)

Enable RLS on sensitive tables:

```sql
-- Farmers can only see their own profile
ALTER TABLE farmers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own farmer profile"
  ON farmers FOR SELECT
  USING (user_id = auth.uid());

-- Orders visible to farmer or admin
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farmers can see own orders"
  ON orders FOR SELECT
  USING (farmer_id = (SELECT id FROM farmers WHERE user_id = auth.uid()));
```

---

## 🗑️ Cleanup & Maintenance

### Remove old delivery routes (keep 30 days)
```sql
DELETE FROM delivery_route 
WHERE timestamp < NOW() - INTERVAL '30 days';
```

### Archive old deliveries
```sql
UPDATE deliveries SET status = 'archived' 
WHERE created_at < NOW() - INTERVAL '60 days' 
AND status = 'delivered';
```

---

**Last Updated:** July 2026
