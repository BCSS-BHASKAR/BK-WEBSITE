-- ---------------------------------------------------------------------------
-- Add chef_absence to the cross-service timeline.
--
-- Apply: psql -U aiserver -d aiserver -f server/sql/timeline_chef_absence.sql
-- Safe to re-run.
--
-- inference_timeline is the union every cross-module view reads: the Active
-- Alerts table, the dashboard's latest captures, and /api/inference/timeline.
-- It listed five services, so chef_absence incidents were ingested, counted on
-- their own page, and then silently absent everywhere those three look - the
-- same event reported differently depending on which page you opened.
--
-- dwell_seconds is deliberately NULL rather than clip_seconds. Every consumer
-- of this view renders that column as a duration, and clip length is not the
-- absence duration (see sql/chef_absence.sql). Feeding it in here would put the
-- wrong number in front of an operator on three more pages.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW inference_timeline AS
 SELECT 'after_hours'::text AS service,
    s.id,
    s.camera_key,
    s.captured_at AS occurred_at,
    s.asset_id,
    NULL::integer AS dwell_seconds,
    s.global_id
   FROM after_hours_sighting s
UNION ALL
 SELECT 'loitering'::text AS service,
    l.id,
    l.stream AS camera_key,
    l.started_at AS occurred_at,
    l.asset_id,
    l.dwell_seconds,
    l.global_id
   FROM loitering_event l
UNION ALL
 SELECT 'intrusion'::text AS service,
    i.id,
    i.camera_key,
    i.occurred_at,
    i.asset_id,
    NULL::integer AS dwell_seconds,
    NULL::integer AS global_id
   FROM intrusion_event i
UNION ALL
 SELECT 'walkins'::text AS service,
    w.id,
    w.camera_key,
    w.detected_at AS occurred_at,
    w.crop_asset_id AS asset_id,
    NULL::integer AS dwell_seconds,
    NULL::integer AS global_id
   FROM walkin_detection w
UNION ALL
 SELECT 'kitchen_unattended'::text AS service,
    k.id,
    k.camera_key,
    k.started_at AS occurred_at,
    k.asset_id,
    k.duration_seconds AS dwell_seconds,
    NULL::integer AS global_id
   FROM kitchen_unattended_event k
UNION ALL
 SELECT 'chef_absence'::text AS service,
    c.id,
    -- chef_absence_incident.camera_key is varchar(190) while the other branches
    -- are varchar(200). Without this cast the union type widens to unbounded
    -- varchar, and CREATE OR REPLACE VIEW refuses to change a column's type.
    c.camera_key::character varying(200) AS camera_key,
    c.started_at AS occurred_at,
    c.asset_id,
    NULL::integer AS dwell_seconds,  -- NOT clip_seconds; see header
    NULL::integer AS global_id
   FROM chef_absence_incident c;
