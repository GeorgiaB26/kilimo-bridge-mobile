# Kilimo Bridge - API Documentation

**Base URL:** `http://localhost:3000/api` (dev) | `https://api.kilimo.app` (production)

---

## 🔐 Authentication

All endpoints require authentication header:
```
Authorization: Bearer {token}
```

### POST /auth/register
Register new user

**Request:**
```json
{
  "email": "farmer@example.com",
  "password": "secure_password",
  "name": "John Farmer",
  "phone": "+256701234567",
  "role": "farmer"
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "farmer@example.com",
  "name": "John Farmer",
  "token": "eyJhbGc...",
  "role": "farmer"
}
```

---

### POST /auth/login
Login user

**Request:**
```json
{
  "email": "farmer@example.com",
  "password": "secure_password"
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "farmer@example.com",
  "token": "eyJhbGc...",
  "role": "farmer"
}
```

---

## 👨‍🌾 Farmers

### GET /farmers
List all farmers

**Query Parameters:**
- `limit` (default: 10) - Number of results
- `offset` (default: 0) - Pagination offset
- `verified` (optional) - Filter by verified status

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": 1,
      "name": "John Farmer",
      "email": "john@example.com",
      "phone": "+256701234567",
      "verified": true,
      "location": "Kampala, Uganda",
      "created_at": "2026-07-01T10:00:00Z"
    }
  ],
  "total": 23,
  "limit": 10,
  "offset": 0
}
```

---

### GET /farmers/:id
Get single farmer

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "John Farmer",
  "email": "john@example.com",
  "phone": "+256701234567",
  "verified": true,
  "location": "Kampala, Uganda",
  "bio": "Growing beans and maize",
  "acres": 2.5,
  "crops": ["beans", "maize", "tomatoes"],
  "created_at": "2026-07-01T10:00:00Z"
}
```

---

### PUT /farmers/:id
Update farmer profile

**Request:**
```json
{
  "name": "John Farmer",
  "phone": "+256701234567",
  "bio": "Growing beans and maize",
  "acres": 2.5,
  "crops": ["beans", "maize", "tomatoes"]
}
```

**Response:** `200 OK` (returns updated farmer object)

---

## 📦 Commodities

### GET /commodities
List all commodities

**Query Parameters:**
- `category` (optional) - Filter by category (grains, vegetables, etc.)
- `search` (optional) - Search by name
- `limit` (default: 50)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": 1,
      "name": "Maize (Grade A)",
      "category": "grains",
      "price_per_unit": 450,
      "currency": "KES",
      "unit": "kg",
      "inventory": 1250,
      "description": "Premium quality maize",
      "image_url": "https://cdn.kilimo.app/maize.jpg"
    }
  ],
  "total": 45
}
```

---

### GET /commodities/:id
Get single commodity

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "Maize (Grade A)",
  "category": "grains",
  "price_per_unit": 450,
  "currency": "KES",
  "unit": "kg",
  "inventory": 1250,
  "description": "Premium quality maize",
  "image_url": "https://cdn.kilimo.app/maize.jpg",
  "history": [
    {
      "date": "2026-07-12",
      "price": 450,
      "inventory": 1250
    }
  ]
}
```

---

### POST /commodities (Admin Only)
Create new commodity

**Request:**
```json
{
  "name": "Maize (Grade A)",
  "category": "grains",
  "price_per_unit": 450,
  "currency": "KES",
  "unit": "kg",
  "inventory": 1000,
  "description": "Premium quality maize"
}
```

**Response:** `201 Created`

---

## 📋 Orders

### GET /orders
List user's orders

**Query Parameters:**
- `status` (optional) - pending, confirmed, shipped, delivered
- `limit` (default: 20)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": 101,
      "farmer_id": 1,
      "commodity_id": 5,
      "quantity": 50,
      "unit": "kg",
      "total_price": 22500,
      "currency": "KES",
      "status": "pending",
      "delivery_location": "Kampala Market",
      "created_at": "2026-07-12T10:00:00Z"
    }
  ],
  "total": 12
}
```

---

### POST /orders
Create new order

**Request:**
```json
{
  "commodity_id": 5,
  "quantity": 50,
  "delivery_location": "Kampala Market",
  "notes": "Deliver by Friday"
}
```

**Response:** `201 Created`
```json
{
  "id": 101,
  "commodity_id": 5,
  "quantity": 50,
  "total_price": 22500,
  "status": "pending",
  "created_at": "2026-07-12T10:00:00Z"
}
```

---

### PUT /orders/:id
Update order status

**Request:**
```json
{
  "status": "confirmed"
}
```

**Response:** `200 OK`

---

## 🚚 Delivery

### GET /deliveries
List deliveries

**Query Parameters:**
- `status` (optional) - pending, in_transit, delivered
- `limit` (default: 20)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": 1,
      "order_id": 101,
      "driver_id": 10,
      "status": "in_transit",
      "location": {
        "lat": -1.2921,
        "lng": 36.8219
      },
      "estimated_arrival": "2026-07-13T14:00:00Z",
      "created_at": "2026-07-12T10:00:00Z"
    }
  ],
  "total": 5
}
```

---

### GET /deliveries/:id
Get delivery details with real-time location

**Response:** `200 OK`
```json
{
  "id": 1,
  "order_id": 101,
  "driver_id": 10,
  "status": "in_transit",
  "current_location": {
    "lat": -1.2921,
    "lng": 36.8219,
    "timestamp": "2026-07-12T11:30:00Z"
  },
  "route": [
    { "lat": -1.2900, "lng": 36.8200 },
    { "lat": -1.2921, "lng": 36.8219 }
  ],
  "estimated_arrival": "2026-07-13T14:00:00Z"
}
```

---

### POST /deliveries/:id/location
Update delivery location (Driver App)

**Request:**
```json
{
  "lat": -1.2921,
  "lng": 36.8219
}
```

**Response:** `200 OK`

---

## 💰 Payments

### POST /payments
Create payment

**Request:**
```json
{
  "order_id": 101,
  "amount": 22500,
  "currency": "KES",
  "payment_method": "m_pesa",
  "phone": "+256701234567"
}
```

**Response:** `200 OK`
```json
{
  "id": 1001,
  "status": "pending",
  "amount": 22500,
  "currency": "KES",
  "created_at": "2026-07-12T10:00:00Z"
}
```

---

### GET /payments/:id
Get payment status

**Response:** `200 OK`
```json
{
  "id": 1001,
  "order_id": 101,
  "status": "completed",
  "amount": 22500,
  "currency": "KES",
  "reference": "M123456789",
  "created_at": "2026-07-12T10:00:00Z",
  "completed_at": "2026-07-12T10:15:00Z"
}
```

---

## 📊 Admin Dashboard

### GET /admin/dashboard
Get dashboard metrics

**Response:** `200 OK`
```json
{
  "farmers": 23,
  "users": 27,
  "active_projects": 6,
  "pending_transactions": 90000,
  "total_orders": 156,
  "revenue": 3500000,
  "growth": {
    "farmers_this_week": 5,
    "orders_this_week": 23
  }
}
```

---

## ❌ Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "message": "Email is required"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "You don't have permission to access this"
}
```

### 404 Not Found
```json
{
  "error": "Not found",
  "message": "Farmer not found"
}
```

### 500 Server Error
```json
{
  "error": "Internal server error",
  "message": "Something went wrong"
}
```

---

## 🔗 Postman Collection

Import this collection for easy testing:
[Link to Postman Collection](https://www.postman.com/collections/kilimo-bridge)

---

**Last Updated:** July 2026
