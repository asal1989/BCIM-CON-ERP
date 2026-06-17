// src/config/migrate.js
// Run: node src/config/migrate.js
require('dotenv').config();
const { pool } = require('./database');

const migrations = `

-- ============================================
-- ConstructERP India — Full Database Schema
-- PostgreSQL
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. COMPANIES & AUTH
-- ============================================

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  gstin VARCHAR(15) UNIQUE,
  pan VARCHAR(10),
  cin VARCHAR(21),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(6),
  phone VARCHAR(15),
  email VARCHAR(100),
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  employee_code VARCHAR(20) UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(15),
  password_hash TEXT NOT NULL,
  role VARCHAR(80) NOT NULL CHECK (BTRIM(role) <> ''),
  designation VARCHAR(100),
  department VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  accessible_modules TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Ensure login_at exists on already-created tables (idempotent)
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS login_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- ============================================
-- 2. PROJECTS
-- ============================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  project_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(30) CHECK (type IN ('residential','commercial','infrastructure','industrial')),
  description TEXT,
  client_name VARCHAR(200),
  client_gstin VARCHAR(15),
  client_pan VARCHAR(10),
  location TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  rera_number VARCHAR(50),
  nhai_contract VARCHAR(50),
  contract_value NUMERIC(15,2),
  start_date DATE,
  end_date DATE,
  actual_end_date DATE,
  project_manager_id UUID REFERENCES users(id),
  site_engineer_id UUID REFERENCES users(id),
  qs_engineer_id UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'planning' CHECK (status IN (
    'planning','active','on_hold','delayed','completed','cancelled'
  )),
  progress_pct NUMERIC(5,2) DEFAULT 0,
  gst_applicable BOOLEAN DEFAULT true,
  gst_type VARCHAR(10) DEFAULT 'intra' CHECK (gst_type IN ('intra','inter')),
  is_active BOOLEAN DEFAULT true,
  retention_percent NUMERIC(5,2) DEFAULT 5,
  mobilization_advance_total NUMERIC(15,2) DEFAULT 0,
  mobilization_advance_recovered NUMERIC(15,2) DEFAULT 0,
  recovery_percentage NUMERIC(5,2) DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role VARCHAR(50),
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. BOQ & QS MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS boq_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  chapter_no VARCHAR(10),
  chapter_name VARCHAR(200),
  item_no VARCHAR(20) NOT NULL,
  sr_no VARCHAR(100),
  description TEXT NOT NULL,
  unit VARCHAR(20) NOT NULL,      -- CUM, SQM, RMT, KG, NOS, LS
  quantity NUMERIC(12,3) NOT NULL,
  rate NUMERIC(12,2) NOT NULL,
  amount NUMERIC(15,2) GENERATED ALWAYS AS (quantity * rate) STORED,
  hsn_code VARCHAR(10),
  remarks TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  boq_item_id UUID REFERENCES boq_items(id),
  work_order_id UUID,             -- FK added later
  mb_number VARCHAR(30),          -- e.g. MB-2025-Skyline-48
  page_number INT,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(200),
  nos NUMERIC(8,2) DEFAULT 1,
  length NUMERIC(10,3),
  breadth NUMERIC(10,3),
  height NUMERIC(10,3),
  quantity NUMERIC(12,3),         -- calculated: nos × L × B × H
  deduction NUMERIC(12,3) DEFAULT 0,
  net_quantity NUMERIC(12,3),     -- quantity - deduction
  drawing_ref VARCHAR(100),
  site_photos TEXT[],             -- array of photo URLs
  remarks TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
    'draft','submitted','qs_approved','pm_approved','rejected'
  )),
  submitted_by UUID REFERENCES users(id),
  qs_approved_by UUID REFERENCES users(id),
  qs_approved_at TIMESTAMPTZ,
  pm_approved_by UUID REFERENCES users(id),
  pm_approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ra_bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  bill_number VARCHAR(30) UNIQUE NOT NULL,
  bill_date DATE NOT NULL,
  bill_period_from DATE,
  bill_period_to DATE,
  gross_amount NUMERIC(15,2) DEFAULT 0,
  gst_rate NUMERIC(5,2) DEFAULT 18,
  gst_amount NUMERIC(15,2) DEFAULT 0,
  gross_with_gst NUMERIC(15,2) DEFAULT 0,
  -- Deductions
  retention_pct NUMERIC(5,2) DEFAULT 5,
  retention_amount NUMERIC(15,2) DEFAULT 0,
  mobilization_advance_recovery NUMERIC(15,2) DEFAULT 0,
  material_recovery_cement NUMERIC(15,2) DEFAULT 0,
  material_recovery_steel NUMERIC(15,2) DEFAULT 0,
  delay_penalty NUMERIC(15,2) DEFAULT 0,
  other_deductions NUMERIC(15,2) DEFAULT 0,
  tds_rate NUMERIC(5,2) DEFAULT 2,
  tds_amount NUMERIC(15,2) DEFAULT 0,
  total_deductions NUMERIC(15,2) DEFAULT 0,
  net_payable NUMERIC(15,2) DEFAULT 0,
  -- Approval workflow
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN (
    'submitted','qs_review','pm_approval','accounts_verify','certified','rejected','paid'
  )),
  submitted_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  qs_approved_by UUID REFERENCES users(id),
  qs_approved_at TIMESTAMPTZ,
  pm_approved_by UUID REFERENCES users(id),
  pm_approved_at TIMESTAMPTZ,
  accounts_approved_by UUID REFERENCES users(id),
  accounts_approved_at TIMESTAMPTZ,
  payment_date DATE,
  payment_mode VARCHAR(20),
  payment_ref VARCHAR(50),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Extra fields for contractor billing
  contractor_name VARCHAR(200),
  contractor_gstin VARCHAR(15),
  contractor_pan VARCHAR(10),
  work_description TEXT,
  price_escalation NUMERIC(15,2) DEFAULT 0,
  certified_by UUID REFERENCES users(id),
  certified_date TIMESTAMPTZ,
  client_tds_amount NUMERIC(15,2) DEFAULT 0,
  amount_received NUMERIC(15,2) DEFAULT 0,
  company_id UUID REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS ra_bill_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ra_bill_id UUID REFERENCES ra_bills(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES boq_items(id),
  prev_certified_qty NUMERIC(12,3) DEFAULT 0,
  current_qty NUMERIC(12,3) NOT NULL,
  cumulative_qty NUMERIC(12,3),
  rate NUMERIC(12,2) NOT NULL,
  amount NUMERIC(15,2) GENERATED ALWAYS AS (current_qty * rate) STORED,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS material_reconciliation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  ra_bill_id UUID REFERENCES ra_bills(id),
  material_name VARCHAR(100) NOT NULL,   -- Cement, Steel, etc.
  unit VARCHAR(20),
  boq_item_id UUID REFERENCES boq_items(id),
  executed_qty NUMERIC(12,3),
  consumption_factor NUMERIC(8,4),       -- bags/CUM, kg/MT etc.
  theoretical_qty NUMERIC(12,3),
  actual_issued_qty NUMERIC(12,3),
  variance NUMERIC(12,3),
  unit_rate NUMERIC(10,2),
  recovery_amount NUMERIC(15,2),
  status VARCHAR(20) DEFAULT 'pending',
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consumption_norms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  boq_item_id UUID REFERENCES boq_items(id) ON DELETE CASCADE,
  material_name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  norm_quantity NUMERIC(10,4) NOT NULL, -- ratio (e.g. 0.35 bags/CUM)
  allowed_wastage_pct NUMERIC(5,2) DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. VENDORS (must exist before Finance tables)
-- ============================================

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  vendor_code VARCHAR(20) UNIQUE,
  name VARCHAR(200) NOT NULL,
  gstin VARCHAR(15),
  pan VARCHAR(10),
  vendor_type VARCHAR(30) CHECK (vendor_type IN (
    'material_supplier','subcontractor','labour_contractor',
    'equipment_supplier','service_provider'
  )),
  contact_person VARCHAR(100),
  phone VARCHAR(15),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  bank_name VARCHAR(100),
  account_number VARCHAR(20),
  ifsc_code VARCHAR(11),
  credit_days INT DEFAULT 30,
  rating NUMERIC(3,1),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. FINANCE MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  vendor_id UUID REFERENCES vendors(id),
  po_id UUID,                         -- FK po_id (unstructured initially)
  grn_id UUID,                        -- FK grn_id
  invoice_number VARCHAR(30) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  taxable_amount NUMERIC(15,2) NOT NULL,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  net_amount NUMERIC(15,2) NOT NULL,
  gst_type VARCHAR(10) DEFAULT 'cgst_sgst' CHECK (gst_type IN ('cgst_sgst','igst','exempt')),
  cgst_rate NUMERIC(5,2) DEFAULT 9,
  sgst_rate NUMERIC(5,2) DEFAULT 9,
  igst_rate NUMERIC(5,2) DEFAULT 0,
  cgst_amount NUMERIC(15,2) DEFAULT 0,
  sgst_amount NUMERIC(15,2) DEFAULT 0,
  igst_amount NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2),
  hsn_code VARCHAR(10) DEFAULT '9954',
  tds_applicable BOOLEAN DEFAULT true,
  tds_rate NUMERIC(5,2) DEFAULT 2,
  tds_amount NUMERIC(15,2) DEFAULT 0,
  due_date DATE,
  tax_details JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','verified','authorized','paid','cancelled')),
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  remarks TEXT,
  verified_by UUID REFERENCES users(id),
  authorized_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  material_name VARCHAR(200),
  unit VARCHAR(20),
  quantity_on_grn NUMERIC(12,3),
  quantity_invoiced NUMERIC(12,3) NOT NULL,
  rate_on_po NUMERIC(12,2),
  rate_invoiced NUMERIC(12,2) NOT NULL,
  tax_percent NUMERIC(5,2) DEFAULT 18,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  net_amount NUMERIC(15,2),
  sort_order INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  payment_type VARCHAR(30),           -- 'vendor', 'salary', 'petty_cash', etc.
  entity_name VARCHAR(200),
  entity_pan VARCHAR(10),
  invoice_id UUID,
  amount NUMERIC(15,2) NOT NULL,
  tds_deducted NUMERIC(15,2) DEFAULT 0,
  net_amount NUMERIC(15,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_mode VARCHAR(20) CHECK (payment_mode IN ('cash','cheque','bank_transfer','upi','other')),
  reference_number VARCHAR(50),
  bank_name VARCHAR(100),
  cost_head VARCHAR(100),
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('pending','success','failed','refunded')),
  remarks TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  cost_head VARCHAR(100) NOT NULL,    -- Material, Labour, Plant, etc.
  budgeted_amount NUMERIC(15,2) NOT NULL,
  actual_amount NUMERIC(15,2) DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retention_releases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL,
  project_id        UUID NOT NULL,
  release_number    TEXT NOT NULL,
  contractor_name   TEXT NOT NULL,
  release_date      DATE NOT NULL,
  milestone         TEXT NOT NULL DEFAULT 'partial',
  release_amount    NUMERIC(15,2) NOT NULL,
  remarks           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  rejection_remarks TEXT,
  payment_date      DATE,
  payment_ref       TEXT,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retention_release_seq (
  company_id UUID PRIMARY KEY,
  fiscal_year TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- 6. PROCUREMENT & INVENTORY
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  vendor_id UUID REFERENCES vendors(id),
  po_number VARCHAR(30) UNIQUE NOT NULL,
  serial_no_formatted VARCHAR(100),
  po_date DATE NOT NULL,
  delivery_date DATE,
  po_req_no VARCHAR(100),
  po_req_date DATE,
  approval_no VARCHAR(100),
  delivery_address TEXT,
  order_intro TEXT,
  sub_total NUMERIC(15,2) DEFAULT 0,
  total_gst NUMERIC(15,2) DEFAULT 0,
  grand_total NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'draft','pending','verified_audit','checked_finance','released_mgmt','approved','sent','part_received','fully_received','cancelled'
  )),
  terms_conditions TEXT,
  notes TEXT,
  bank_details TEXT,
  remarks TEXT,
  created_by UUID REFERENCES users(id),
  verified_procurement_by UUID REFERENCES users(id),
  verified_procurement_at TIMESTAMPTZ,
  checked_finance_by UUID REFERENCES users(id),
  checked_finance_at TIMESTAMPTZ,
  released_mgmt_by UUID REFERENCES users(id),
  released_mgmt_at TIMESTAMPTZ,
  authorized_md_by UUID REFERENCES users(id),
  authorized_md_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS po_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_name VARCHAR(200) NOT NULL,
  hsn_code VARCHAR(10),
  quantity NUMERIC(12,3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  rate NUMERIC(12,2) NOT NULL,
  gst_rate NUMERIC(5,2) DEFAULT 18,
  gst_amount NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2) DEFAULT 0,
  req_date DATE,
  purpose TEXT,
  sort_order INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grn (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  po_id UUID REFERENCES purchase_orders(id),
  vendor_id UUID REFERENCES vendors(id),
  grn_number VARCHAR(30) UNIQUE NOT NULL,
  serial_no_formatted VARCHAR(100),
  gate_pass_no VARCHAR(50),
  wb_slip_no VARCHAR(50),
  grn_date DATE NOT NULL,
  total_quantity NUMERIC(12,3) DEFAULT 0,
  site_location VARCHAR(100),
  quality_status VARCHAR(20) DEFAULT 'pending' CHECK (quality_status IN (
    'pending','verified_stores','approved','rejected','partial'
  )),
  remarks TEXT,
  received_by UUID REFERENCES users(id),
  verified_stores_by UUID REFERENCES users(id),
  verified_stores_at TIMESTAMPTZ,
  approved_qc_by UUID REFERENCES users(id),
  approved_qc_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grn_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grn_id UUID REFERENCES grn(id) ON DELETE CASCADE,
  po_item_id UUID,
  material_name VARCHAR(200) NOT NULL,
  quantity_received NUMERIC(12,3) NOT NULL,
  unit VARCHAR(20),
  quality_remarks TEXT,
  batch_number VARCHAR(50),
  expiry_date DATE,
  sort_order INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  material_name VARCHAR(200) NOT NULL,
  material_code VARCHAR(30),
  hsn_code VARCHAR(10),
  unit VARCHAR(20) NOT NULL,
  site_location VARCHAR(100),
  opening_stock NUMERIC(12,3) DEFAULT 0,
  closing_stock NUMERIC(12,3) DEFAULT 0,
  unit_rate NUMERIC(12,2) DEFAULT 0,
  category VARCHAR(100),
  major_head VARCHAR(50),
  dc_idc VARCHAR(10),
  remarks TEXT,
  minimum_level NUMERIC(12,3) DEFAULT 0,
  reorder_level NUMERIC(12,3) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, material_name, site_location)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  expiry_date DATE,
  opening_quantity NUMERIC(12,3) NOT NULL,
  current_quantity NUMERIC(12,3) NOT NULL,
  grn_id UUID REFERENCES grn(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  inventory_id UUID REFERENCES inventory(id),
  transaction_type VARCHAR(20) CHECK (transaction_type IN (
    'grn','issue','return','transfer_in','transfer_out','adjustment'
  )),
  quantity NUMERIC(12,3) NOT NULL,
  reference_id UUID,                  -- grn_id or issue_id
  reference_number VARCHAR(50),
  issued_to VARCHAR(200),             -- contractor / work order
  remarks TEXT,
  transacted_by UUID REFERENCES users(id),
  transacted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. SITE MODULE — DPR, WORK ORDERS
-- ============================================

CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  wo_number VARCHAR(30) UNIQUE NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  work_description TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  contract_amount NUMERIC(15,2),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN (
    'draft','active','approved','completed','terminated','closed','disputed'
  )),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_progress_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  dpr_number VARCHAR(30),
  report_date DATE NOT NULL,
  weather VARCHAR(20),
  work_done JSONB,                    -- array of {description, status, remarks}
  material_consumed JSONB,            -- array of {material, qty, unit}
  equipment_status JSONB,
  issues TEXT,
  tomorrow_plan TEXT,
  site_photos TEXT[],
  submitted_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'submitted',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. HR & LABOUR MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  project_id UUID REFERENCES projects(id),
  name VARCHAR(100) NOT NULL,
  skill_type VARCHAR(30),
  gang_name VARCHAR(50),
  mobile VARCHAR(15),
  daily_rate NUMERIC(10,2) NOT NULL,
  ot_rate NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('present','absent','half_day','leave')),
  ot_hours NUMERIC(4,2) DEFAULT 0,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  days_present NUMERIC(4,1) DEFAULT 0,
  ot_hours NUMERIC(5,2) DEFAULT 0,
  basic_wages NUMERIC(15,2) DEFAULT 0,
  ot_wages NUMERIC(15,2) DEFAULT 0,
  gross_wages NUMERIC(15,2) DEFAULT 0,
  pf_employee NUMERIC(15,2) DEFAULT 0,
  pf_employer NUMERIC(15,2) DEFAULT 0,
  esi_employee NUMERIC(15,2) DEFAULT 0,
  esi_employer NUMERIC(15,2) DEFAULT 0,
  net_wages NUMERIC(15,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','cancelled')),
  payment_date DATE,
  payment_mode VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, period_from, period_to)
);

-- ============================================
-- 8. HSE MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  incident_number VARCHAR(30) UNIQUE NOT NULL,
  incident_date DATE NOT NULL,
  incident_time TIME,
  location VARCHAR(200),
  incident_type VARCHAR(30) CHECK (incident_type IN (
    'near_miss','minor_injury','major_accident','fatality',
    'property_damage','environmental','fire'
  )),
  severity VARCHAR(20) CHECK (severity IN ('low','medium','high','critical')),
  description TEXT NOT NULL,
  people_involved JSONB,              -- [{name, role, injury_type}]
  root_cause TEXT,
  immediate_action TEXT,
  lost_time_days INT DEFAULT 0,
  reported_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN (
    'open','investigating','capa_pending','closed'
  )),
  site_photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  action_description TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id),
  due_date DATE,
  completed_date DATE,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_progress','closed','overdue')),
  closure_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  permit_number VARCHAR(30) UNIQUE NOT NULL,
  permit_type VARCHAR(30) CHECK (permit_type IN (
    'work_at_height','hot_work','excavation','electrical',
    'confined_space','radiography','demolition'
  )),
  work_description TEXT,
  location VARCHAR(200),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  issued_to VARCHAR(200),
  preconditions JSONB,               -- checklist items [{item, checked}]
  issued_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN (
    'draft','active','expired','cancelled','closed'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  inspection_date DATE NOT NULL,
  inspection_type VARCHAR(50),        -- daily, weekly, monthly
  area_inspected VARCHAR(200),
  checklist JSONB,                   -- [{item, status, remarks}]
  observations TEXT,
  score INT,
  photos TEXT[],
  inspected_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ppe_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  worker_id UUID REFERENCES workers(id),
  item_type VARCHAR(30) CHECK (item_type IN (
    'helmet','safety_shoes','gloves','harness','vest',
    'goggles','ear_plugs','mask','face_shield'
  )),
  item_code VARCHAR(30),
  issued_date DATE NOT NULL,
  expiry_date DATE,
  condition VARCHAR(20) DEFAULT 'good',
  issued_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  hazard_description TEXT NOT NULL,
  activity VARCHAR(200),
  location VARCHAR(200),
  likelihood INT CHECK (likelihood BETWEEN 1 AND 5),
  severity INT CHECK (severity BETWEEN 1 AND 5),
  risk_score INT GENERATED ALWAYS AS (likelihood * severity) STORED,
  risk_level VARCHAR(20),            -- low/medium/high/critical
  control_measures TEXT,
  residual_risk VARCHAR(20),
  reviewed_by UUID REFERENCES users(id),
  review_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. ASSET MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  asset_code VARCHAR(30) UNIQUE NOT NULL,
  asset_name VARCHAR(200) NOT NULL,
  asset_type VARCHAR(30) CHECK (asset_type IN (
    'heavy_machinery','vehicle','tool','equipment',
    'it_asset','office_equipment','furniture'
  )),
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  purchase_date DATE,
  purchase_value NUMERIC(15,2),
  vendor_id UUID REFERENCES vendors(id),
  warranty_expiry DATE,
  amc_expiry DATE,
  current_location UUID REFERENCES projects(id),
  assigned_to UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN (
    'available','assigned','maintenance','idle','scrapped'
  )),
  qr_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID REFERENCES assets(id),
  from_project_id UUID REFERENCES projects(id),
  to_project_id UUID REFERENCES projects(id),
  moved_by UUID REFERENCES users(id),
  movement_date DATE NOT NULL,
  reason TEXT,
  condition_at_transfer VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID REFERENCES assets(id),
  maintenance_type VARCHAR(20) CHECK (maintenance_type IN (
    'preventive','breakdown','amc'
  )),
  maintenance_date DATE NOT NULL,
  description TEXT,
  cost NUMERIC(10,2),
  vendor_id UUID REFERENCES vendors(id),
  next_due_date DATE,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. IT DEPARTMENT
-- ============================================

CREATE TABLE IF NOT EXISTS it_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  asset_tag VARCHAR(30) UNIQUE NOT NULL,
  asset_type VARCHAR(30) CHECK (asset_type IN (
    'laptop','desktop','printer','biometric','router',
    'switch','cctv','server','mobile','tablet','ups'
  )),
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  purchase_date DATE,
  purchase_cost NUMERIC(10,2),
  warranty_expiry DATE,
  assigned_to UUID REFERENCES users(id),
  location_project_id UUID REFERENCES projects(id),
  location_description VARCHAR(200),
  os VARCHAR(50),
  status VARCHAR(20) DEFAULT 'in_use' CHECK (status IN (
    'in_stock','in_use','under_repair','scrapped'
  )),
  antivirus_status VARCHAR(20),
  antivirus_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS it_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  raised_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  it_asset_id UUID REFERENCES it_assets(id),
  project_id UUID REFERENCES projects(id),
  category VARCHAR(30) CHECK (category IN (
    'hardware','software','network','cctv_biometric','email','other'
  )),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN (
    'low','medium','high','critical'
  )),
  subject VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN (
    'open','in_progress','pending_user','resolved','closed'
  )),
  sla_response_hours INT,
  sla_resolve_hours INT,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS software_licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  software_name VARCHAR(100) NOT NULL,
  vendor VARCHAR(100),
  license_type VARCHAR(50),
  license_key TEXT,
  quantity INT DEFAULT 1,
  purchase_cost NUMERIC(10,2),
  purchase_date DATE,
  expiry_date DATE,
  auto_renew BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS amc_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  equipment_description VARCHAR(200) NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  amc_value NUMERIC(10,2),
  start_date DATE,
  end_date DATE,
  coverage TEXT,
  contact_person VARCHAR(100),
  contact_phone VARCHAR(15),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. CRM MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS unit_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  unit_number VARCHAR(20) NOT NULL,
  flat_type VARCHAR(50),
  area_sqft NUMERIC(8,2),
  floor_number INT,
  client_name VARCHAR(200) NOT NULL,
  client_phone VARCHAR(15),
  client_email VARCHAR(100),
  client_pan VARCHAR(10),
  client_aadhaar VARCHAR(12),
  agreement_value NUMERIC(15,2),
  booking_date DATE,
  agreement_date DATE,
  possession_date DATE,
  status VARCHAR(20) DEFAULT 'booked' CHECK (status IN (
    'lead','booked','agreement_done','possession_given','cancelled'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES unit_bookings(id) ON DELETE CASCADE,
  milestone VARCHAR(200) NOT NULL,   -- e.g. "Slab Floor 12"
  due_date DATE,
  amount NUMERIC(15,2) NOT NULL,
  gst_amount NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2),
  collected_amount NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending','partial','paid','overdue'
  )),
  payment_date DATE,
  payment_mode VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_boq_project ON boq_items(project_id);
CREATE INDEX IF NOT EXISTS idx_measurements_project ON measurements(project_id);
CREATE INDEX IF NOT EXISTS idx_measurements_boq ON measurements(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_ra_bills_project ON ra_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_grn_project ON grn(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_project ON inventory(project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_worker_date ON attendance(worker_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_incidents_project ON incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_project ON permits(project_id);
CREATE INDEX IF NOT EXISTS idx_it_tickets_status ON it_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_assets_company ON assets(company_id);

-- ============================================
-- STORES MODULE — MRS & MIN
-- ============================================

CREATE TABLE IF NOT EXISTS material_requisitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  mrs_number VARCHAR(30) UNIQUE NOT NULL,
  site_incharge VARCHAR(100),
  required_by DATE NOT NULL,
  priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','issued','rejected')),
  raised_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_on TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mrs_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mrs_id UUID REFERENCES material_requisitions(id) ON DELETE CASCADE,
  material_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  purpose TEXT,
  sort_order INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS material_issue_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  min_number VARCHAR(30) UNIQUE NOT NULL,
  mrs_id UUID REFERENCES material_requisitions(id),
  issued_to VARCHAR(200),
  issued_to_user UUID REFERENCES users(id),
  issued_by UUID REFERENCES users(id),
  vehicle_number VARCHAR(20),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_value NUMERIC(15,2) DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS min_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  min_id UUID REFERENCES material_issue_notes(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id),
  material_name VARCHAR(200) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  quantity_requested NUMERIC(12,3),
  quantity_issued NUMERIC(12,3) NOT NULL,
  rate NUMERIC(12,2) DEFAULT 0,
  amount NUMERIC(15,2) DEFAULT 0,
  purpose TEXT,
  sort_order INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_mrs_project ON material_requisitions(project_id);
CREATE INDEX IF NOT EXISTS idx_mrs_status ON material_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_min_project ON material_issue_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_min_mrs ON material_issue_notes(mrs_id);

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50),
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 13. PROCUREMENT LIFECYCLE MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS material_indents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  project_id UUID REFERENCES projects(id),
  indent_number VARCHAR(20) UNIQUE,
  raised_by UUID REFERENCES users(id),
  required_by DATE NOT NULL,
  priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  remarks TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
    'draft','pending','approved','rejected','escalated','po_raised'
  )),
  cs_status TEXT DEFAULT 'pending_entry',
  cs_selected_vendor_id UUID REFERENCES vendors(id),
  cs_verified_by UUID REFERENCES users(id),
  cs_verified_at TIMESTAMPTZ,
  cs_checked_by UUID REFERENCES users(id),
  cs_checked_at TIMESTAMPTZ,
  cs_approved_by UUID REFERENCES users(id),
  cs_approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approval_remarks TEXT,
  escalated_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indent_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  indent_id UUID REFERENCES material_indents(id) ON DELETE CASCADE,
  material_category VARCHAR(100),
  material_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit VARCHAR(20),
  approved_quantity NUMERIC(12,3),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  indent_id UUID REFERENCES material_indents(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id),
  quotation_number VARCHAR(20) UNIQUE,
  unit_rate NUMERIC(12,2) DEFAULT 0,
  gst_rate NUMERIC(5,2) DEFAULT 18,
  delivery_days INT,
  payment_terms VARCHAR(200),
  notes TEXT,
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  indent_item_id UUID REFERENCES indent_items(id) ON DELETE CASCADE,
  rate NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  gst_rate NUMERIC(5,2) DEFAULT 18,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qs_certifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  grn_id UUID REFERENCES grn(id),
  po_id UUID REFERENCES purchase_orders(id),
  cert_number VARCHAR(20) UNIQUE,
  certified_quantity NUMERIC(12,3) NOT NULL,
  unit_rate NUMERIC(12,2) NOT NULL,
  gross_amount NUMERIC(14,2),
  deduction_amount NUMERIC(14,2) DEFAULT 0,
  deduction_reason TEXT,
  retention_pct NUMERIC(5,2) DEFAULT 5,
  retention_amount NUMERIC(14,2),
  gst_pct NUMERIC(5,2) DEFAULT 18,
  gst_amount NUMERIC(14,2),
  net_amount NUMERIC(14,2),
  quality_remarks TEXT,
  certified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50),
  entity_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL,
  performed_by UUID REFERENCES users(id),
  remarks TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS variation_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  vo_number VARCHAR(30) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected')),
  total_variation_amount NUMERIC(15,2) DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS variation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vo_id UUID REFERENCES variation_orders(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES boq_items(id),
  new_item_description TEXT,
  unit VARCHAR(20),
  quantity NUMERIC(12,3) NOT NULL,
  rate NUMERIC(12,2) NOT NULL,
  amount NUMERIC(15,2) GENERATED ALWAYS AS (quantity * rate) STORED,
  reason TEXT
);

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_vendors_company      ON vendors(company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_type         ON vendors(vendor_type);
CREATE INDEX IF NOT EXISTS idx_invoices_company     ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project     ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor      ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created     ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_company     ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_project     ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_grn_vendor           ON grn(vendor_id);
CREATE INDEX IF NOT EXISTS idx_tqs_bill_upd_bill    ON tqs_bill_updates(bill_id);

`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running database migrations...');
    await client.query(migrations);
    console.log('✅ All tables created successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
