# Inference configuration contract (web app → OMEN host)

This document is for whoever maintains the on-prem inference services and
`s3_sync.py` on the OMEN Windows box.

## Why this exists

The Settings screen in the web app lets an administrator change detector
parameters — loitering dwell threshold, after-hours schedule, ROI, confidence
floors. But **the detectors do not run on the web server.** The web app is a
read-only consumer of what the OMEN host uploads: it can `ListObjectsV2`,
`GetObject` and presign against `bk-inference-storage`, and nothing else. There
is no inbound path from AWS to the Windows machine — no API, no queue, no agent.

So configuration is delivered through the bucket both sides already share. The
web app writes a small versioned JSON document; **the on-prem side must poll it
and apply the values.** Until that reader exists, settings saved in the UI are
persisted and published but *not in force*, and the UI says so explicitly
(`pendingDelivery: true`).

## The object

```
bucket : bk-inference-storage
region : ap-south-1
key    : config/inference-config.json
```

Written with `Cache-Control: no-cache`, so a plain GET always returns the
current version. Object metadata carries `version` and `published-by`.

## The document

```json
{
  "schemaVersion": 1,
  "version": 2,
  "publishedAt": "2026-08-06T16:31:04.996Z",
  "site": "biryani-katha",
  "modules": {
    "walkins":            { "enabled": true, "confidence": 0.5, "minPersonSize": 40, "cooldownSeconds": 5, "cameras": [] },
    "loitering":          { "enabled": true, "thresholdSeconds": 300, "confidence": 0.6, "cameras": [] },
    "intrusion":          { "enabled": true, "confidence": 0.5, "alertDelaySeconds": 0, "zonesEnabled": true, "roi": [], "cameras": [] },
    "after_hours":        { "enabled": true, "startHour": 21, "endHour": 7, "confidence": 0.5, "cameras": [] },
    "kitchen_unattended": { "enabled": true, "maxUnattendedSeconds": 300, "alertCooldownSeconds": 120, "confidence": 0.5, "cameras": [] }
  }
}
```

### Field notes

| Field | Meaning |
|---|---|
| `schemaVersion` | Bump only on a breaking shape change. **Refuse a document whose `schemaVersion` you do not understand** rather than half-applying it. |
| `version` | Monotonic. Increments on every settings save. Use it to skip work when nothing changed. |
| `publishedAt` | ISO-8601 UTC, informational. |
| `site` | Guard against applying another site's config if the bucket is ever shared. |
| `modules.*.enabled` | `false` should stop that detector from writing new artefacts. |
| `modules.*.cameras` | Empty array means *all cameras*. A non-empty array restricts the detector to those camera ids. |
| `modules.*.confidence` | 0–1 floor. |
| `loitering.thresholdSeconds` | Dwell time before a clip is written. Was hard-coded to 180. |
| `after_hours.startHour` / `endHour` | Local (IST) hours, inclusive start, exclusive end. Wraps midnight when `startHour > endHour` — `21 → 7` means 21:00 to 07:00. |
| `intrusion.roi` | Array of polygons, each `[[x, y], …]` in pixel coordinates of that camera's frame. Empty means the detector keeps its current built-in ROI. |
| `kitchen_unattended.maxUnattendedSeconds` | How long the kitchen may be empty before an event is raised. |

The web app validates ranges before publishing (e.g. `thresholdSeconds` 10–7200,
`startHour`/`endHour` 0–23 and not equal), so you can treat the values as
well-formed — but still range-check defensively.

## Suggested reader

Poll every 30–60 s. This is one small GET; it costs nothing.

```python
import json, time, boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3", region_name="ap-south-1")
BUCKET, KEY = "bk-inference-storage", "config/inference-config.json"

_current = {"version": -1}

def poll_config():
    """Return the config dict if it changed since last poll, else None."""
    global _current
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=KEY)
        doc = json.loads(obj["Body"].read())
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None          # nothing published yet - keep running on defaults
        raise

    if doc.get("schemaVersion") != 1:
        print(f"[config] unsupported schemaVersion {doc.get('schemaVersion')}, ignoring")
        return None
    if doc.get("site") not in (None, "biryani-katha"):
        return None
    if doc.get("version", 0) <= _current["version"]:
        return None              # unchanged

    _current = doc
    return doc
```

Apply the returned `modules[<your_module>]` dict to the running detector. If a
parameter can only take effect on restart, restart that detector — but **never
drop in-flight footage**, and keep writing to the same S3 prefixes.

## What the web app guarantees

- The settings table is the source of truth; the S3 object is only the transport.
- Every change is recorded in `app_setting_audit` with who changed it and whether
  publication succeeded.
- If the S3 write fails, the setting is still saved and the error is recorded —
  an administrator can re-publish from Settings without re-entering values.
- The web app never writes anywhere else in the bucket. `uploads/` is read-only
  to it.

## What the web app does NOT do

- It cannot restart, health-check or query the detectors.
- It cannot confirm a published value was applied. If you want that, have the
  on-prem side write `config/inference-config-ack.json` containing the `version`
  it has applied, and the Settings screen can show delivery confirmation. That
  is not implemented yet on either side.
