-- V15: media pipeline (quarantine -> scan -> staff approval -> public copy) and owner-submission conversion.
-- Additive only.

-- ---------- 1. malware-scan results ----------
-- not_scanned: no scanner configured (local "none"); clean / infected: scanner verdict; scan_failed: scanner error.
-- Only "clean" files can ever be approved for public use (enforced by the API and by CHECK constraints below).
ALTER TABLE property_submission_files DROP CONSTRAINT ck_submission_file_scan;
ALTER TABLE property_submission_files ADD CONSTRAINT ck_submission_file_scan CHECK (scan_status IN ('not_scanned','clean','infected','scan_failed'));
ALTER TABLE property_submission_files ADD COLUMN scanned_at timestamptz;
ALTER TABLE property_submission_files ADD COLUMN scanner varchar(30);

-- listing/project media: the original stays in the PRIVATE store (original_key); storage_key points to the PUBLIC
-- copy, which exists only after approval. Rows created before approval carry the private key in both columns and
-- are never returned publicly (public queries require approved_at, is_public and processing_status = 'ready').
ALTER TABLE property_media ADD COLUMN original_key varchar(200);
ALTER TABLE property_media ADD COLUMN content_type varchar(50);
ALTER TABLE property_media ADD COLUMN size_bytes integer;
ALTER TABLE property_media ADD COLUMN sha256 char(64);
ALTER TABLE property_media ADD COLUMN scan_status varchar(15) NOT NULL DEFAULT 'not_scanned';
ALTER TABLE property_media ADD COLUMN scanned_at timestamptz;
ALTER TABLE property_media ADD COLUMN scanner varchar(30);
ALTER TABLE property_media ADD COLUMN uploaded_by uuid REFERENCES users(id);
ALTER TABLE property_media ADD COLUMN source_submission_file_id uuid REFERENCES property_submission_files(id);
ALTER TABLE property_media ADD CONSTRAINT ck_property_media_scan CHECK (scan_status IN ('not_scanned','clean','infected','scan_failed'));
ALTER TABLE property_media ADD CONSTRAINT ck_property_media_approved_clean CHECK (approved_at IS NULL OR scan_status = 'clean');
ALTER TABLE property_media ALTER COLUMN is_public SET DEFAULT false;

ALTER TABLE project_media ADD COLUMN original_key varchar(200);
ALTER TABLE project_media ADD COLUMN content_type varchar(50);
ALTER TABLE project_media ADD COLUMN size_bytes integer;
ALTER TABLE project_media ADD COLUMN sha256 char(64);
ALTER TABLE project_media ADD COLUMN scan_status varchar(15) NOT NULL DEFAULT 'not_scanned';
ALTER TABLE project_media ADD COLUMN scanned_at timestamptz;
ALTER TABLE project_media ADD COLUMN scanner varchar(30);
ALTER TABLE project_media ADD COLUMN uploaded_by uuid REFERENCES users(id);
ALTER TABLE project_media ADD CONSTRAINT ck_project_media_scan CHECK (scan_status IN ('not_scanned','clean','infected','scan_failed'));
ALTER TABLE project_media ADD CONSTRAINT ck_project_media_approved_clean CHECK (approved_at IS NULL OR scan_status = 'clean');
ALTER TABLE project_media ALTER COLUMN is_public SET DEFAULT false;

-- ---------- 2. owner submission -> draft listing ----------
-- One draft listing per submission at most (UNIQUE); the listing keeps the submission reference.
ALTER TABLE property_submissions ADD COLUMN property_id uuid UNIQUE REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE property_submissions ADD COLUMN converted_by uuid REFERENCES users(id);
ALTER TABLE property_submissions ADD COLUMN converted_at timestamptz;

-- ---------- 3. listing workflow audit trail ----------
-- Every status change of a listing or project (draft -> pending_review -> approved/rejected -> published ...).
CREATE TABLE listing_status_history (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
    project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
    from_status varchar(20),
    to_status   varchar(20) NOT NULL,
    note        text,
    changed_by  uuid REFERENCES users(id),
    changed_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_listing_history_target CHECK ((property_id IS NULL) <> (project_id IS NULL))
);
CREATE INDEX idx_listing_history_property ON listing_status_history (property_id, changed_at);
CREATE INDEX idx_listing_history_project ON listing_status_history (project_id, changed_at);
