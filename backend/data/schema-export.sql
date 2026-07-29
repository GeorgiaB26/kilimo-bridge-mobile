CREATE TABLE agents (
      agent_id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      government_id_encrypted TEXT NOT NULL,
      aggregation_center TEXT NOT NULL,
      region TEXT NOT NULL,
      district TEXT NOT NULL,
      status TEXT DEFAULT 'pending_verification',
      verified_by TEXT,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )

CREATE TABLE aggregation_centres (
        centre_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        location_level_1 TEXT NOT NULL,
        location_level_2 TEXT,
        region TEXT,
        status TEXT DEFAULT 'Active',
        created_at TEXT DEFAULT (datetime('now'))
      , manager_name TEXT, manager_phone TEXT)

CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      success INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )

CREATE TABLE bank_transactions (
      id TEXT PRIMARY KEY,
      payment_id TEXT,
      farmer_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'KES',
      recipient_phone TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      equity_reference TEXT,
      equity_response TEXT,
      error_message TEXT,
      initiated_by TEXT,
      webhook_received_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
    )

CREATE TABLE centre_inventory (
        id TEXT PRIMARY KEY,
        centre_id TEXT NOT NULL,
        farmer_id TEXT NOT NULL,
        task_id TEXT,
        product_name TEXT NOT NULL,
        quantity_received REAL NOT NULL,
        unit TEXT DEFAULT 'kg',
        quality_status TEXT DEFAULT 'pending',
        quality_notes TEXT,
        received_date TEXT DEFAULT (datetime('now')),
        scanned_by_user_id TEXT,
        is_marketplace_ready INTEGER DEFAULT 0,
        marketplace_price_per_unit REAL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (centre_id) REFERENCES aggregation_centres(centre_id),
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )

CREATE TABLE farmer_projects (
      id TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      payment_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Assigned',
      completion_percentage INTEGER DEFAULT 0,
      earnings_amount INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'Pending',
      start_date TEXT,
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )

CREATE TABLE farmer_tasks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        farmer_id TEXT NOT NULL,
        program_project_id TEXT NOT NULL,
        status TEXT DEFAULT 'not-started',
        submitted_date TEXT,
        approved_date TEXT,
        completed_date TEXT,
        photo_evidence_url TEXT,
        notes TEXT,
        rejection_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(task_id, farmer_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
        FOREIGN KEY (program_project_id) REFERENCES program_projects(id)
      )

CREATE TABLE farmers (
      farmer_id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      id_number TEXT UNIQUE NOT NULL,
      membership_group_id TEXT NOT NULL,
      aggregation_center TEXT,
      phone_number TEXT UNIQUE NOT NULL,
      country TEXT DEFAULT 'Kenya',
      district TEXT NOT NULL,
      sub_county TEXT NOT NULL,
      parish TEXT,
      village TEXT,
      membership_type TEXT DEFAULT 'Active',
      occupation TEXT,
      size_of_land REAL,
      picture_url TEXT,
      project_1 TEXT,
      project_2 TEXT,
      project_3 TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), id_number_encrypted TEXT, bank_account_encrypted TEXT, registered_by_agent_id TEXT, kb_farmer_id TEXT, location_path TEXT, location_level_1 TEXT, location_level_2 TEXT, location_level_3 TEXT, location_level_4 TEXT, phone_country_prefix TEXT,
      FOREIGN KEY (membership_group_id) REFERENCES membership_groups(id)
    )

CREATE TABLE import_sessions (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'pending',
      total_rows INTEGER DEFAULT 0,
      valid_rows INTEGER DEFAULT 0,
      invalid_rows INTEGER DEFAULT 0,
      duplicates INTEGER DEFAULT 0,
      imported_count INTEGER DEFAULT 0,
      data TEXT,
      errors TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )

CREATE TABLE locations (
        location_id TEXT PRIMARY KEY,
        country TEXT NOT NULL,
        level_1 TEXT,
        level_2 TEXT,
        level_3 TEXT,
        level_4 TEXT,
        location_path TEXT,
        aggregation_centers_count INTEGER DEFAULT 0
      )

CREATE TABLE membership_groups (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )

CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )

CREATE TABLE otp_codes (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )

CREATE TABLE payment_verifications (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      agent_user_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (agent_user_id) REFERENCES users(user_id)
    )

CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL,
      farmer_project_id TEXT,
      project_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'KES',
      payment_method TEXT DEFAULT 'M-Pesa',
      payment_status TEXT DEFAULT 'Pending',
      mpesa_reference TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT, processed_by TEXT, verification_status TEXT DEFAULT 'unverified',
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
    )

CREATE TABLE program_project_farmers (
        id TEXT PRIMARY KEY,
        program_project_id TEXT NOT NULL,
        farmer_id TEXT NOT NULL,
        status TEXT DEFAULT 'assigned',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(program_project_id, farmer_id),
        FOREIGN KEY (program_project_id) REFERENCES program_projects(id),
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
      )

CREATE TABLE program_projects (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        name TEXT NOT NULL,
        region TEXT,
        budget_kes INTEGER,
        start_date TEXT,
        end_date TEXT,
        status TEXT DEFAULT 'active',
        country_manager_id TEXT,
        total_tasks INTEGER DEFAULT 0,
        completed_tasks INTEGER DEFAULT 0,
        is_test INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (program_id) REFERENCES programs(id),
        FOREIGN KEY (country_manager_id) REFERENCES users(user_id)
      )

CREATE TABLE programs (
        id TEXT PRIMARY KEY,
        sector_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')), budget_kes INTEGER,
        FOREIGN KEY (sector_id) REFERENCES sectors(id)
      )

CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )

CREATE TABLE sectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        country TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )

CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        program_project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        task_order INTEGER NOT NULL,
        payment_value_kes INTEGER DEFAULT 0,
        assigned_agronomist_id TEXT,
        due_date TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (program_project_id) REFERENCES program_projects(id)
      )

CREATE TABLE users (
      user_id TEXT PRIMARY KEY,
      phone_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      farmer_id TEXT,
      district TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), password_hash TEXT, region TEXT, aggregation_center TEXT,
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
    )