-- Migration: Add payment + dispute columns to pa_requests table
-- Run against SQLite: sqlite3 insurcare.db < migrate_payment_dispute.sql

ALTER TABLE pa_requests ADD COLUMN payment_status VARCHAR(30) DEFAULT 'not_applicable' NOT NULL;
ALTER TABLE pa_requests ADD COLUMN transaction_id VARCHAR(50);
ALTER TABLE pa_requests ADD COLUMN disbursed_amount_inr FLOAT;
ALTER TABLE pa_requests ADD COLUMN paid_at DATETIME;
ALTER TABLE pa_requests ADD COLUMN disputed BOOLEAN DEFAULT 0 NOT NULL;
ALTER TABLE pa_requests ADD COLUMN dispute_reason TEXT;
