/**
 * IANA timezone → approximate coordinates.
 *
 * This is how the site knows roughly where a visitor is without ever
 * asking. Intl.DateTimeFormat().resolvedOptions().timeZone is
 * already in the browser — no permission prompt, no geolocation API,
 * no IP lookup service, no third party seeing your visitors.
 *
 * It's city-level at best and that is deliberately all we want. We
 * need enough to put a light on a globe and say what time it is
 * where you are. Anything more precise would be worse: creepier,
 * slower, and dependent on a service that can go down.
 */

export type Place = { lon: number; lat: number; city: string };

export const timezonePlaces: Record<string, Place> = {
  // North America
  "America/New_York": { lon: -74.0, lat: 40.71, city: "New York" },
  "America/Detroit": { lon: -83.05, lat: 42.33, city: "Detroit" },
  "America/Toronto": { lon: -79.38, lat: 43.65, city: "Toronto" },
  "America/Montreal": { lon: -73.57, lat: 45.5, city: "Montreal" },
  "America/Chicago": { lon: -87.63, lat: 41.88, city: "Chicago" },
  "America/Winnipeg": { lon: -97.14, lat: 49.9, city: "Winnipeg" },
  "America/Denver": { lon: -104.99, lat: 39.74, city: "Denver" },
  "America/Edmonton": { lon: -113.49, lat: 53.55, city: "Edmonton" },
  "America/Phoenix": { lon: -112.07, lat: 33.45, city: "Phoenix" },
  "America/Los_Angeles": { lon: -118.24, lat: 34.05, city: "Los Angeles" },
  "America/Vancouver": { lon: -123.12, lat: 49.28, city: "Vancouver" },
  "America/Anchorage": { lon: -149.9, lat: 61.22, city: "Anchorage" },
  "Pacific/Honolulu": { lon: -157.86, lat: 21.31, city: "Honolulu" },
  "America/Mexico_City": { lon: -99.13, lat: 19.43, city: "Mexico City" },
  "America/Monterrey": { lon: -100.32, lat: 25.69, city: "Monterrey" },
  "America/Tijuana": { lon: -117.04, lat: 32.51, city: "Tijuana" },
  "America/Guatemala": { lon: -90.51, lat: 14.63, city: "Guatemala City" },
  "America/Panama": { lon: -79.52, lat: 8.98, city: "Panama City" },
  "America/Havana": { lon: -82.38, lat: 23.11, city: "Havana" },
  "America/Puerto_Rico": { lon: -66.11, lat: 18.47, city: "San Juan" },
  "America/Halifax": { lon: -63.57, lat: 44.65, city: "Halifax" },
  "America/St_Johns": { lon: -52.71, lat: 47.56, city: "St John's" },

  // South America
  "America/Bogota": { lon: -74.07, lat: 4.71, city: "Bogotá" },
  "America/Lima": { lon: -77.04, lat: -12.05, city: "Lima" },
  "America/Caracas": { lon: -66.9, lat: 10.49, city: "Caracas" },
  "America/Santiago": { lon: -70.65, lat: -33.46, city: "Santiago" },
  "America/Argentina/Buenos_Aires": { lon: -58.38, lat: -34.6, city: "Buenos Aires" },
  "America/Sao_Paulo": { lon: -46.63, lat: -23.55, city: "São Paulo" },
  "America/Bahia": { lon: -38.5, lat: -12.97, city: "Salvador" },
  "America/Manaus": { lon: -60.02, lat: -3.12, city: "Manaus" },
  "America/Montevideo": { lon: -56.16, lat: -34.9, city: "Montevideo" },
  "America/La_Paz": { lon: -68.15, lat: -16.5, city: "La Paz" },
  "America/Asuncion": { lon: -57.58, lat: -25.26, city: "Asunción" },
  "America/Guayaquil": { lon: -79.9, lat: -2.17, city: "Guayaquil" },

  // Europe
  "Europe/London": { lon: -0.13, lat: 51.51, city: "London" },
  "Europe/Dublin": { lon: -6.26, lat: 53.35, city: "Dublin" },
  "Europe/Lisbon": { lon: -9.14, lat: 38.72, city: "Lisbon" },
  "Europe/Madrid": { lon: -3.7, lat: 40.42, city: "Madrid" },
  "Europe/Paris": { lon: 2.35, lat: 48.86, city: "Paris" },
  "Europe/Brussels": { lon: 4.35, lat: 50.85, city: "Brussels" },
  "Europe/Amsterdam": { lon: 4.9, lat: 52.37, city: "Amsterdam" },
  "Europe/Berlin": { lon: 13.4, lat: 52.52, city: "Berlin" },
  "Europe/Zurich": { lon: 8.54, lat: 47.37, city: "Zurich" },
  "Europe/Vienna": { lon: 16.37, lat: 48.21, city: "Vienna" },
  "Europe/Rome": { lon: 12.5, lat: 41.9, city: "Rome" },
  "Europe/Prague": { lon: 14.44, lat: 50.08, city: "Prague" },
  "Europe/Warsaw": { lon: 21.01, lat: 52.23, city: "Warsaw" },
  "Europe/Budapest": { lon: 19.04, lat: 47.5, city: "Budapest" },
  "Europe/Stockholm": { lon: 18.07, lat: 59.33, city: "Stockholm" },
  "Europe/Oslo": { lon: 10.75, lat: 59.91, city: "Oslo" },
  "Europe/Copenhagen": { lon: 12.57, lat: 55.68, city: "Copenhagen" },
  "Europe/Helsinki": { lon: 24.94, lat: 60.17, city: "Helsinki" },
  "Europe/Athens": { lon: 23.73, lat: 37.98, city: "Athens" },
  "Europe/Bucharest": { lon: 26.1, lat: 44.43, city: "Bucharest" },
  "Europe/Sofia": { lon: 23.32, lat: 42.7, city: "Sofia" },
  "Europe/Belgrade": { lon: 20.46, lat: 44.79, city: "Belgrade" },
  "Europe/Kyiv": { lon: 30.52, lat: 50.45, city: "Kyiv" },
  "Europe/Kiev": { lon: 30.52, lat: 50.45, city: "Kyiv" },
  "Europe/Moscow": { lon: 37.62, lat: 55.76, city: "Moscow" },
  "Europe/Istanbul": { lon: 28.98, lat: 41.01, city: "Istanbul" },

  // Africa
  "Africa/Casablanca": { lon: -7.6, lat: 33.57, city: "Casablanca" },
  "Africa/Algiers": { lon: 3.06, lat: 36.75, city: "Algiers" },
  "Africa/Tunis": { lon: 10.18, lat: 36.8, city: "Tunis" },
  "Africa/Cairo": { lon: 31.24, lat: 30.04, city: "Cairo" },
  "Africa/Lagos": { lon: 3.38, lat: 6.52, city: "Lagos" },
  "Africa/Accra": { lon: -0.19, lat: 5.6, city: "Accra" },
  "Africa/Abidjan": { lon: -4.03, lat: 5.35, city: "Abidjan" },
  "Africa/Dakar": { lon: -17.45, lat: 14.72, city: "Dakar" },
  "Africa/Nairobi": { lon: 36.82, lat: -1.29, city: "Nairobi" },
  "Africa/Addis_Ababa": { lon: 38.74, lat: 9.03, city: "Addis Ababa" },
  "Africa/Johannesburg": { lon: 28.05, lat: -26.2, city: "Johannesburg" },
  "Africa/Kinshasa": { lon: 15.3, lat: -4.33, city: "Kinshasa" },

  // Middle East & Central Asia
  "Asia/Jerusalem": { lon: 35.22, lat: 31.77, city: "Jerusalem" },
  "Asia/Beirut": { lon: 35.5, lat: 33.89, city: "Beirut" },
  "Asia/Dubai": { lon: 55.27, lat: 25.2, city: "Dubai" },
  "Asia/Qatar": { lon: 51.53, lat: 25.29, city: "Doha" },
  "Asia/Riyadh": { lon: 46.72, lat: 24.71, city: "Riyadh" },
  "Asia/Kuwait": { lon: 47.98, lat: 29.38, city: "Kuwait City" },
  "Asia/Tehran": { lon: 51.39, lat: 35.69, city: "Tehran" },
  "Asia/Baghdad": { lon: 44.36, lat: 33.31, city: "Baghdad" },
  "Asia/Baku": { lon: 49.87, lat: 40.41, city: "Baku" },
  "Asia/Tashkent": { lon: 69.24, lat: 41.3, city: "Tashkent" },
  "Asia/Almaty": { lon: 76.95, lat: 43.26, city: "Almaty" },
  "Asia/Karachi": { lon: 67.0, lat: 24.86, city: "Karachi" },
  "Asia/Kabul": { lon: 69.18, lat: 34.53, city: "Kabul" },

  // South & East Asia
  "Asia/Kolkata": { lon: 88.36, lat: 22.57, city: "Kolkata" },
  "Asia/Calcutta": { lon: 72.88, lat: 19.08, city: "Mumbai" },
  "Asia/Colombo": { lon: 79.86, lat: 6.93, city: "Colombo" },
  "Asia/Kathmandu": { lon: 85.32, lat: 27.72, city: "Kathmandu" },
  "Asia/Dhaka": { lon: 90.41, lat: 23.81, city: "Dhaka" },
  "Asia/Yangon": { lon: 96.2, lat: 16.87, city: "Yangon" },
  "Asia/Bangkok": { lon: 100.5, lat: 13.75, city: "Bangkok" },
  "Asia/Ho_Chi_Minh": { lon: 106.66, lat: 10.76, city: "Ho Chi Minh City" },
  "Asia/Saigon": { lon: 106.66, lat: 10.76, city: "Ho Chi Minh City" },
  "Asia/Jakarta": { lon: 106.85, lat: -6.21, city: "Jakarta" },
  "Asia/Singapore": { lon: 103.82, lat: 1.35, city: "Singapore" },
  "Asia/Kuala_Lumpur": { lon: 101.69, lat: 3.14, city: "Kuala Lumpur" },
  "Asia/Manila": { lon: 120.98, lat: 14.6, city: "Manila" },
  "Asia/Hong_Kong": { lon: 114.17, lat: 22.32, city: "Hong Kong" },
  "Asia/Taipei": { lon: 121.56, lat: 25.03, city: "Taipei" },
  "Asia/Shanghai": { lon: 121.47, lat: 31.23, city: "Shanghai" },
  "Asia/Chongqing": { lon: 106.55, lat: 29.56, city: "Chongqing" },
  "Asia/Seoul": { lon: 126.98, lat: 37.57, city: "Seoul" },
  "Asia/Tokyo": { lon: 139.69, lat: 35.69, city: "Tokyo" },
  "Asia/Vladivostok": { lon: 131.9, lat: 43.12, city: "Vladivostok" },
  "Asia/Novosibirsk": { lon: 82.93, lat: 55.03, city: "Novosibirsk" },
  "Asia/Yekaterinburg": { lon: 60.6, lat: 56.84, city: "Yekaterinburg" },

  // Oceania
  "Australia/Perth": { lon: 115.86, lat: -31.95, city: "Perth" },
  "Australia/Adelaide": { lon: 138.6, lat: -34.93, city: "Adelaide" },
  "Australia/Darwin": { lon: 130.84, lat: -12.46, city: "Darwin" },
  "Australia/Brisbane": { lon: 153.03, lat: -27.47, city: "Brisbane" },
  "Australia/Sydney": { lon: 151.21, lat: -33.87, city: "Sydney" },
  "Australia/Melbourne": { lon: 144.96, lat: -37.81, city: "Melbourne" },
  "Australia/Hobart": { lon: 147.33, lat: -42.88, city: "Hobart" },
  "Pacific/Auckland": { lon: 174.76, lat: -36.85, city: "Auckland" },
  "Pacific/Fiji": { lon: 178.44, lat: -18.14, city: "Suva" },
  "Pacific/Port_Moresby": { lon: 147.15, lat: -9.44, city: "Port Moresby" },

  // Atlantic
  "Atlantic/Reykjavik": { lon: -21.94, lat: 64.15, city: "Reykjavík" },
  "Atlantic/Canary": { lon: -15.43, lat: 28.12, city: "Las Palmas" },
  "Atlantic/Azores": { lon: -25.67, lat: 37.74, city: "Ponta Delgada" },
};

/**
 * Best-effort place for the current visitor.
 *
 * If their exact zone isn't listed we fall back to their UTC offset,
 * which puts them on the right meridian at a plausible latitude.
 * That's a worse guess but never a wrong-feeling one — you end up
 * somewhere in your own part of the world.
 */
export function resolveVisitorPlace(): Place & { timezone: string } {
  let timezone = "UTC";

  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    /* ancient browser; fall through to the offset path */
  }

  const exact = timezonePlaces[timezone];
  if (exact) return { ...exact, timezone };

  // Offset fallback. getTimezoneOffset is minutes *behind* UTC, so
  // the sign is inverted relative to what you'd expect.
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  const lon = Math.max(-180, Math.min(180, offsetHours * 15));

  // Guess a hemisphere from the zone prefix when we have one.
  const southern = /^(Australia|Pacific\/Auckland|Africa\/Johannesburg|America\/(Sao_Paulo|Argentina|Santiago))/.test(
    timezone,
  );

  return {
    lon,
    lat: southern ? -28 : 38,
    city: timezone.split("/").pop()?.replace(/_/g, " ") ?? "your corner of the world",
    timezone,
  };
}

/** Local clock time in a given zone, as HH:MM. */
export function timeIn(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  }
}
