export type ReverseGeocodedAddress = {
  house_number?: string;
  house_name?: string;
  building?: string;
  amenity?: string;
  shop?: string;
  office?: string;
  road?: string;
  pedestrian?: string;
  residential?: string;
  footway?: string;
  path?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  village?: string;
  town?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  postcode?: string;
};

export function formatStreetAddress(address: ReverseGeocodedAddress): string {
  const road = address.road ?? address.pedestrian ?? address.residential ?? address.footway ?? address.path;
  const parts = [address.house_name, address.building, address.amenity, address.shop, address.office]
    .filter((part): part is string => Boolean(part?.trim()));
  const street = [address.house_number, road].filter((part): part is string => Boolean(part?.trim())).join(' ');
  if (street) parts.push(street);
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))]
    .filter((part, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index)
    .join(', ');
}

export function getAddressLocality(address: ReverseGeocodedAddress): string {
  return address.neighbourhood ?? address.quarter ?? address.suburb ?? address.city_district ?? address.village ?? '';
}

export function getAddressCity(address: ReverseGeocodedAddress): string {
  return address.city ?? address.town ?? address.village ?? address.district ?? address.county ?? '';
}
