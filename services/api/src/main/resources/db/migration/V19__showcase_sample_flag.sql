-- V19: local demo showcase items are synthetic data (type C) like sample listings: marked is_sample, hidden from every
-- public endpoint unless unavora.public.include-sample-content=true (local/test only), and the startup guard refuses a
-- non-local environment whose database contains any. Set only by the local demo loader; the CMS never sets it.
ALTER TABLE showcase_items ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
