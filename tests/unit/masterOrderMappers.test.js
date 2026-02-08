import { normalizeMasterOrder, normalizeMasterOrderList } from '../../src/screens/master/mappers/orderMappers';
import { ORDER_STATUS } from '../../src/services/orders';

describe('master order mappers', () => {
  it('normalizes partial order payload with defaults', () => {
    const input = { id: 'ord-1', serviceType: 'repair', pricingType: 'fixed' };
    const normalized = normalizeMasterOrder(input, ORDER_STATUS.PLACED);
    expect(normalized.status).toBe(ORDER_STATUS.PLACED);
    expect(normalized.urgency).toBe('planned');
    expect(normalized.service_type).toBe('repair');
    expect(normalized.pricing_type).toBe('fixed');
  });

  it('drops invalid list items and keeps valid ones', () => {
    const items = [{ id: '1', status: 'placed' }, null, { foo: 'bar' }];
    const normalized = normalizeMasterOrderList(items, ORDER_STATUS.PLACED);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe('1');
  });
});
