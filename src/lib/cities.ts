/**
 * City lights for the hero globe.
 *
 * These are real coordinates. That matters more than it sounds: you
 * don't recognise Earth at night from coastlines, you recognise it
 * from where the light clusters are — the European sprawl, the
 * Indian subcontinent, the Japanese and Korean arcs, the two
 * American coasts, the dark middle of Africa and Australia. Random
 * dots never read as Earth. Real ones always do.
 *
 * Format: [longitude, latitude, intensity 0-1].
 * Intensity is rough lit-area scale, not population.
 */
export type City = [number, number, number];

export const cities: City[] = [
  // ── North America ────────────────────────────────────────────
  [-74.0, 40.7, 1.0],   // New York
  [-118.2, 34.1, 1.0],  // Los Angeles
  [-87.6, 41.9, 0.9],   // Chicago
  [-95.4, 29.8, 0.85],  // Houston
  [-96.8, 32.8, 0.85],  // Dallas
  [-98.5, 29.4, 0.7],   // San Antonio
  [-97.7, 30.3, 0.65],  // Austin
  [-112.1, 33.4, 0.75], // Phoenix
  [-75.2, 40.0, 0.8],   // Philadelphia
  [-77.0, 38.9, 0.8],   // Washington DC
  [-71.1, 42.4, 0.75],  // Boston
  [-80.2, 25.8, 0.8],   // Miami
  [-84.4, 33.7, 0.75],  // Atlanta
  [-83.0, 42.3, 0.7],   // Detroit
  [-122.3, 37.8, 0.8],  // San Francisco
  [-122.3, 47.6, 0.7],  // Seattle
  [-104.9, 39.7, 0.65], // Denver
  [-115.1, 36.2, 0.6],  // Las Vegas
  [-90.1, 38.6, 0.6],   // St Louis
  [-86.2, 39.8, 0.55],  // Indianapolis
  [-93.3, 44.9, 0.6],   // Minneapolis
  [-79.4, 43.7, 0.8],   // Toronto
  [-73.6, 45.5, 0.7],   // Montreal
  [-123.1, 49.3, 0.6],  // Vancouver
  [-114.1, 51.0, 0.5],  // Calgary
  [-99.1, 19.4, 0.95],  // Mexico City
  [-103.3, 20.7, 0.6],  // Guadalajara
  [-100.3, 25.7, 0.6],  // Monterrey
  [-106.5, 31.8, 0.5],  // El Paso / Juarez
  [-117.0, 32.5, 0.6],  // San Diego / Tijuana
  [-81.4, 28.5, 0.6],   // Orlando
  [-90.1, 30.0, 0.5],   // New Orleans
  [-76.6, 39.3, 0.6],   // Baltimore
  [-82.5, 27.9, 0.6],   // Tampa
  [-80.8, 35.2, 0.55],  // Charlotte
  [-86.8, 36.2, 0.5],   // Nashville
  [-111.9, 40.8, 0.5],  // Salt Lake City
  [-97.5, 35.5, 0.45],  // Oklahoma City
  [-94.6, 39.1, 0.5],   // Kansas City
  [-66.1, 18.5, 0.45],  // San Juan
  [-82.4, 23.1, 0.45],  // Havana

  // ── South America ────────────────────────────────────────────
  [-46.6, -23.5, 1.0],  // São Paulo
  [-43.2, -22.9, 0.85], // Rio de Janeiro
  [-58.4, -34.6, 0.9],  // Buenos Aires
  [-70.7, -33.4, 0.7],  // Santiago
  [-77.0, -12.0, 0.75], // Lima
  [-74.1, 4.7, 0.75],   // Bogotá
  [-66.9, 10.5, 0.6],   // Caracas
  [-78.5, -0.2, 0.5],   // Quito
  [-47.9, -15.8, 0.55], // Brasília
  [-38.5, -12.9, 0.5],  // Salvador
  [-34.9, -8.0, 0.5],   // Recife
  [-60.0, -3.1, 0.4],   // Manaus
  [-68.1, -16.5, 0.45], // La Paz
  [-56.2, -34.9, 0.45], // Montevideo
  [-57.6, -25.3, 0.45], // Asunción
  [-64.2, -31.4, 0.4],  // Córdoba
  [-79.9, -2.2, 0.45],  // Guayaquil
  [-51.2, -30.0, 0.5],  // Porto Alegre

  // ── Europe ───────────────────────────────────────────────────
  [-0.1, 51.5, 1.0],    // London
  [2.35, 48.86, 1.0],   // Paris
  [13.4, 52.5, 0.9],    // Berlin
  [12.5, 41.9, 0.85],   // Rome
  [-3.7, 40.4, 0.85],   // Madrid
  [2.17, 41.4, 0.75],   // Barcelona
  [4.9, 52.4, 0.8],     // Amsterdam
  [4.35, 50.85, 0.75],  // Brussels
  [8.68, 50.1, 0.75],   // Frankfurt
  [11.6, 48.1, 0.7],    // Munich
  [6.96, 50.9, 0.7],    // Cologne
  [9.99, 53.5, 0.7],    // Hamburg
  [16.4, 48.2, 0.7],    // Vienna
  [14.4, 50.1, 0.65],   // Prague
  [21.0, 52.2, 0.7],    // Warsaw
  [19.0, 47.5, 0.6],    // Budapest
  [18.07, 59.33, 0.65], // Stockholm
  [10.75, 59.91, 0.6],  // Oslo
  [12.57, 55.68, 0.65], // Copenhagen
  [24.94, 60.17, 0.55], // Helsinki
  [37.6, 55.75, 0.9],   // Moscow
  [30.3, 59.9, 0.75],   // St Petersburg
  [30.5, 50.5, 0.7],    // Kyiv
  [28.98, 41.0, 0.9],   // Istanbul
  [23.73, 37.98, 0.65], // Athens
  [-9.14, 38.72, 0.6],  // Lisbon
  [-6.26, 53.35, 0.55], // Dublin
  [-2.24, 53.48, 0.6],  // Manchester
  [-4.25, 55.86, 0.5],  // Glasgow
  [9.19, 45.46, 0.7],   // Milan
  [7.68, 45.07, 0.55],  // Turin
  [14.27, 40.85, 0.6],  // Naples
  [26.1, 44.4, 0.6],    // Bucharest
  [23.32, 42.7, 0.5],   // Sofia
  [20.46, 44.8, 0.5],   // Belgrade
  [8.54, 47.37, 0.55],  // Zurich
  [-0.38, 39.47, 0.5],  // Valencia
  [-5.98, 37.39, 0.5],  // Seville
  [49.1, 55.8, 0.5],    // Kazan
  [60.6, 56.8, 0.5],    // Yekaterinburg

  // ── Africa ───────────────────────────────────────────────────
  [31.24, 30.05, 0.95], // Cairo
  [3.38, 6.52, 0.85],   // Lagos
  [28.05, -26.2, 0.8],  // Johannesburg
  [18.42, -33.92, 0.65],// Cape Town
  [31.03, -29.86, 0.5], // Durban
  [36.82, -1.29, 0.6],  // Nairobi
  [38.74, 9.03, 0.55],  // Addis Ababa
  [-7.6, 33.57, 0.6],   // Casablanca
  [3.06, 36.75, 0.6],   // Algiers
  [10.18, 36.8, 0.5],   // Tunis
  [13.19, 32.89, 0.45], // Tripoli
  [-17.45, 14.72, 0.5], // Dakar
  [-0.19, 5.6, 0.55],   // Accra
  [-4.03, 5.35, 0.5],   // Abidjan
  [32.58, 0.32, 0.45],  // Kampala
  [39.27, -6.79, 0.5],  // Dar es Salaam
  [15.3, -4.33, 0.5],   // Kinshasa
  [13.23, -8.84, 0.5],  // Luanda
  [32.56, 15.55, 0.5],  // Khartoum
  [7.49, 9.06, 0.45],   // Abuja
  [35.5, 33.9, 0.5],    // Beirut
  [31.2, 29.9, 0.5],    // Giza
  [35.2, 31.8, 0.55],   // Jerusalem
  [34.78, 32.08, 0.6],  // Tel Aviv

  // ── Middle East & Central Asia ───────────────────────────────
  [55.3, 25.2, 0.85],   // Dubai
  [54.4, 24.5, 0.6],    // Abu Dhabi
  [51.5, 25.3, 0.6],    // Doha
  [46.7, 24.7, 0.75],   // Riyadh
  [39.2, 21.5, 0.6],    // Jeddah
  [51.39, 35.69, 0.8],  // Tehran
  [44.4, 33.3, 0.6],    // Baghdad
  [47.98, 29.37, 0.5],  // Kuwait City
  [49.87, 40.41, 0.5],  // Baku
  [44.5, 40.18, 0.45],  // Yerevan
  [69.24, 41.3, 0.5],   // Tashkent
  [76.95, 43.26, 0.45], // Almaty
  [71.45, 51.18, 0.4],  // Astana
  [69.18, 34.53, 0.45], // Kabul
  [67.0, 24.86, 0.8],   // Karachi
  [74.35, 31.55, 0.7],  // Lahore
  [73.05, 33.68, 0.5],  // Islamabad

  // ── South & East Asia ────────────────────────────────────────
  [77.21, 28.61, 1.0],  // Delhi
  [72.88, 19.08, 0.95], // Mumbai
  [88.36, 22.57, 0.8],  // Kolkata
  [80.27, 13.08, 0.75], // Chennai
  [77.59, 12.97, 0.8],  // Bengaluru
  [78.49, 17.39, 0.7],  // Hyderabad
  [72.57, 23.03, 0.6],  // Ahmedabad
  [73.86, 18.52, 0.6],  // Pune
  [75.79, 26.91, 0.5],  // Jaipur
  [80.95, 26.85, 0.5],  // Lucknow
  [90.41, 23.81, 0.8],  // Dhaka
  [85.32, 27.72, 0.45], // Kathmandu
  [79.86, 6.93, 0.5],   // Colombo
  [116.41, 39.9, 1.0],  // Beijing
  [121.47, 31.23, 1.0], // Shanghai
  [113.26, 23.13, 0.95],// Guangzhou
  [114.06, 22.54, 0.9], // Shenzhen
  [114.17, 22.32, 0.85],// Hong Kong
  [106.55, 29.56, 0.8], // Chongqing
  [104.07, 30.57, 0.75],// Chengdu
  [108.95, 34.26, 0.7], // Xi'an
  [117.2, 39.08, 0.7],  // Tianjin
  [118.78, 32.06, 0.7], // Nanjing
  [120.15, 30.27, 0.7], // Hangzhou
  [114.3, 30.59, 0.7],  // Wuhan
  [123.43, 41.8, 0.65], // Shenyang
  [125.32, 43.82, 0.55],// Changchun
  [126.63, 45.76, 0.55],// Harbin
  [112.55, 37.87, 0.5], // Taiyuan
  [103.83, 36.06, 0.45],// Lanzhou
  [87.62, 43.83, 0.4],  // Urumqi
  [121.56, 25.03, 0.75],// Taipei
  [139.69, 35.69, 1.0], // Tokyo
  [135.5, 34.69, 0.85], // Osaka
  [136.91, 35.18, 0.7], // Nagoya
  [130.4, 33.59, 0.6],  // Fukuoka
  [141.35, 43.06, 0.55],// Sapporo
  [126.98, 37.57, 0.95],// Seoul
  [129.08, 35.18, 0.65],// Busan
  [125.75, 39.03, 0.3], // Pyongyang (famously dark)
  [100.5, 13.75, 0.85], // Bangkok
  [103.82, 1.35, 0.8],  // Singapore
  [101.69, 3.14, 0.75], // Kuala Lumpur
  [106.85, -6.21, 0.9], // Jakarta
  [107.6, -6.91, 0.6],  // Bandung
  [112.75, -7.26, 0.6], // Surabaya
  [120.98, 14.6, 0.85], // Manila
  [106.66, 10.76, 0.8], // Ho Chi Minh City
  [105.85, 21.03, 0.7], // Hanoi
  [104.92, 11.56, 0.5], // Phnom Penh
  [96.2, 16.87, 0.5],   // Yangon
  [95.96, 21.95, 0.35], // Mandalay

  // ── Oceania ──────────────────────────────────────────────────
  [151.21, -33.87, 0.85], // Sydney
  [144.96, -37.81, 0.8],  // Melbourne
  [153.03, -27.47, 0.65], // Brisbane
  [115.86, -31.95, 0.6],  // Perth
  [138.6, -34.93, 0.5],   // Adelaide
  [149.13, -35.28, 0.4],  // Canberra
  [174.76, -36.85, 0.55], // Auckland
  [174.78, -41.29, 0.4],  // Wellington
  [172.64, -43.53, 0.4],  // Christchurch
  [147.3, -42.88, 0.3],   // Hobart
  [145.77, -16.92, 0.3],  // Cairns
  [130.84, -12.46, 0.3],  // Darwin
  [147.15, -9.44, 0.3],   // Port Moresby
  [178.44, -18.14, 0.25], // Suva

  // ── High latitude / sparse, for silhouette ───────────────────
  [-21.9, 64.1, 0.35],  // Reykjavik
  [-114.4, 62.5, 0.2],  // Yellowknife
  [-135.1, 60.7, 0.2],  // Whitehorse
  [-149.9, 61.2, 0.35], // Anchorage
  [-157.9, 21.3, 0.4],  // Honolulu
  [18.95, 69.65, 0.2],  // Tromsø
  [25.73, 71.0, 0.15],  // Nordkapp
  [82.9, 55.0, 0.45],   // Novosibirsk
  [104.3, 52.3, 0.3],   // Irkutsk
  [129.73, 62.03, 0.25],// Yakutsk
  [131.9, 43.1, 0.4],   // Vladivostok
  [158.65, 53.04, 0.2], // Petropavlovsk
  [106.92, 47.89, 0.4], // Ulaanbaatar
  [-68.3, -54.8, 0.15], // Ushuaia
  [-70.9, -53.2, 0.2],  // Punta Arenas
];
