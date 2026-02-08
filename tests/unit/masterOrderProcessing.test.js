import {
  buildMasterCounters,
  filterPoolOrders,
  sortMyJobs,
} from '../../src/screens/master/hooks/useMasterOrderProcessing';

describe('master order processing', () => {
  it('filters pool orders by service/urgency/area/pricing', () => {
    const orders = [
      { id: '1', urgency: 'emergency', service_type: 'plumbing', area: 'A', pricing_type: 'fixed', created_at: '2026-02-08T10:00:00Z' },
      { id: '2', urgency: 'planned', service_type: 'electrician', area: 'B', pricing_type: 'unknown', created_at: '2026-02-08T11:00:00Z' },
    ];
    const filtered = filterPoolOrders(orders, { urgency: 'emergency', service: 'plumbing', area: 'A', pricing: 'fixed' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('sorts my jobs by status priority and urgency', () => {
    const myOrders = [
      { id: 'a', status: 'claimed', urgency: 'planned', preferred_date: '2026-02-09', preferred_time: '12:00:00', created_at: '2026-02-08T09:00:00Z' },
      { id: 'b', status: 'started', urgency: 'urgent', created_at: '2026-02-08T08:00:00Z' },
      { id: 'c', status: 'claimed', urgency: 'emergency', preferred_date: '2026-02-09', preferred_time: '11:00:00', created_at: '2026-02-08T07:00:00Z' },
    ];
    const sorted = sortMyJobs(myOrders);
    expect(sorted.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('builds dashboard counters', () => {
    const myOrders = [
      { status: 'claimed', urgency: 'urgent' },
      { status: 'started', urgency: 'emergency' },
      { status: 'completed', urgency: 'planned' },
      { status: 'confirmed', urgency: 'planned' },
    ];
    const counters = buildMasterCounters(myOrders);
    expect(counters.activeJobsCount).toBe(3);
    expect(counters.immediateOrdersCount).toBe(2);
    expect(counters.startedOrdersCount).toBe(1);
    expect(counters.pendingOrdersCount).toBe(1);
  });
});
