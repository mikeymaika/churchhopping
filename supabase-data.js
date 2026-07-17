// Loads the shared Church Hopping state from Supabase (read-only).
// Mirrors the fetch in the original app.js.
const SUPABASE_URL = "https://wjembxkybxpsardbmkra.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZW1ieGt5Ynhwc2FyZGJta3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjA2MDYsImV4cCI6MjA5NjMzNjYwNn0.8Yy2N38pVjxnaNXbHOSbCM8iCcZ4vl3AGDdZQgCwVtU";
const TABLE = "shared_map_state";
const STATE_ID = "main";

export async function loadCloudState() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${STATE_ID}&select=data`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows?.[0]?.data || null;
}

export async function saveCloudState(data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${STATE_ID}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() })
    }
  );
  if (!res.ok) throw new Error(await res.text());
}

export function mustSeeIds(data) {
  return new Set((data?.routePlans?.["must-see"]?.steps || []).map(s => s.checkpointId));
}

// Project lat/lng (or legacy x/y percentages) into on-screen percentages
// within the given ranges, using a padded bounding box of all points.
export function projectPoints(points, xRange = [6, 60], yRange = [18, 85]) {
  const ll = points.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  let bbox = null;
  if (ll.length) {
    const lats = ll.map(p => Number(p.lat));
    const lngs = ll.map(p => Number(p.lng));
    bbox = {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLng: Math.min(...lngs), maxLng: Math.max(...lngs)
    };
  }
  const span = (a, b) => (b - a) || 1;
  return points.map(p => {
    let fx = 0.5, fy = 0.5;
    if (bbox && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))) {
      fx = (Number(p.lng) - bbox.minLng) / span(bbox.minLng, bbox.maxLng);
      fy = (bbox.maxLat - Number(p.lat)) / span(bbox.minLat, bbox.maxLat);
    } else if (Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
      fx = Number(p.x) / 100;
      fy = Number(p.y) / 100;
    }
    return {
      ...p,
      screenX: `${(xRange[0] + fx * (xRange[1] - xRange[0])).toFixed(2)}%`,
      screenY: `${(yRange[0] + fy * (yRange[1] - yRange[0])).toFixed(2)}%`
    };
  });
}
