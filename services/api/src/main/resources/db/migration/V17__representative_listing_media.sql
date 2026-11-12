-- V17: owner decision 2026-11-12 — until real photographs are onboarded, listings and projects may carry licensed
-- REPRESENTATIVE images. They are always labelled "Representative image" on the website, need a recorded licence
-- before approval, and are meant to be replaced by real photographs (kind actual_photo / render).
ALTER TABLE property_media DROP CONSTRAINT ck_property_media_kind;
ALTER TABLE property_media ADD CONSTRAINT ck_property_media_kind CHECK (kind IN ('actual_photo','render','floor_plan','representative'));
ALTER TABLE property_media ADD CONSTRAINT ck_property_media_licence CHECK (approved_at IS NULL OR kind <> 'representative' OR licence IS NOT NULL);

ALTER TABLE project_media DROP CONSTRAINT ck_project_media_kind;
ALTER TABLE project_media ADD CONSTRAINT ck_project_media_kind CHECK (kind IN ('actual_photo','render','floor_plan','representative'));
ALTER TABLE project_media ADD CONSTRAINT ck_project_media_licence CHECK (approved_at IS NULL OR kind <> 'representative' OR licence IS NOT NULL);
