-- V1: extensions, shared functions, sequences.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Human-readable public references. Numbers only; formatting is done in the application.
CREATE SEQUENCE property_number_seq START 1001;
CREATE SEQUENCE customer_ref_seq    START 1;
CREATE SEQUENCE lead_ref_seq        START 1;
CREATE SEQUENCE visit_ref_seq       START 1;
CREATE SEQUENCE deal_ref_seq        START 1;
CREATE SEQUENCE payment_ref_seq     START 1;
CREATE SEQUENCE project_number_seq  START 101;
