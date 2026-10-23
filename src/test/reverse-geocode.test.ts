import { describe, expect, it } from 'vitest';
import { formatStreetAddress, getAddressCity, getAddressLocality } from '@/lib/reverse-geocode';

describe('reverse geocoded address formatting', () => {
  it('includes building, house number and street when map data provides them', () => {
    expect(formatStreetAddress({
      house_number: '12A',
      building: 'Rose Apartments',
      road: 'Market Road',
    })).toBe('Rose Apartments, 12A Market Road');
  });

  it('uses available road variants and omits duplicate components', () => {
    expect(formatStreetAddress({ house_name: 'The Arcade', pedestrian: 'The Arcade' })).toBe('The Arcade');
  });

  it('selects the most specific available locality and city values', () => {
    expect(getAddressLocality({ neighbourhood: 'Indiranagar', suburb: 'East Bengaluru' })).toBe('Indiranagar');
    expect(getAddressCity({ town: 'Bengaluru', district: 'Bengaluru Urban' })).toBe('Bengaluru');
  });
});
