import type { EngineAlert } from '../../schemas.js';

export function mergeAlerts(records: EngineAlert[], now: Date): EngineAlert[] {
  const byId = new Map<string, EngineAlert>();
  for (const alert of records) {
    const previous = byId.get(alert.id);
    byId.set(alert.id, previous ? { ...previous, ...alert, publishedAt: alert.publishedAt ?? previous.publishedAt } : alert);
  }
  return [...byId.values()].map((alert) => {
    let status = alert.status;
    if (status !== 'cancelled') {
      if (alert.startsAt && Date.parse(alert.startsAt) > now.getTime()) status = 'planned';
      else if (alert.endsAt && Date.parse(alert.endsAt) < now.getTime()) status = 'resolved';
      else if (alert.startsAt && Date.parse(alert.startsAt) <= now.getTime()) status = 'ongoing';
    }
    return { ...alert, status };
  }).sort((a, b) => (Date.parse(a.startsAt ?? a.updatedAt) || 0) - (Date.parse(b.startsAt ?? b.updatedAt) || 0));
}
