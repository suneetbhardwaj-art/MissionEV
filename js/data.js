/**
 * MissionEV — emissions model and DEMO sample data.
 *
 * ONE calculation model feeds every number in the UI (lab, charts, tooltips, transaction
 * preview, weekly mix, route comparison, city simulator, sample trips).
 *
 * UNITS (never mixed):
 *   distance            kilometres (km)
 *   emission factors    grams CO2e per km (per passenger-km for shared transit)
 *   electricity         kWh per km (per passenger-km for shared transit)
 *   grid factors        grams CO2e per kWh
 *   results             kilograms CO2e  = distanceKm * gramsPerKm / 1000
 *
 * AVOIDED EMISSIONS = baseline emissions − selected-journey emissions   (signed)
 *   positive  -> the selected journey emits LESS than the baseline
 *   negative  -> the selected journey emits MORE than the baseline
 *
 * SOURCES AND STATUS OF EACH FACTOR (nothing here is a certified carbon credit):
 *   grid factor    CEA "CO2 Baseline Database for the Indian Power Sector" (cea.nic.in). 0.727 tCO2/MWh is the
 *                  FY2023-24 weighted-average figure as reported by SolarQuarter (6 Jan 2025). Later CEA
 *                  versions (v22.0, Aug 2026) may have revised it; the primary table was not re-checked.
 *   solar factor   ~48 g/kWh: lifecycle median for utility-scale solar PV, IPCC AR5 WG3 Annex III (verify before reuse).
 *   fossil g/km    PROJECT ASSUMPTIONS that mirror the tiers in EVMobilityRewards.sol (196 petrol, 224 diesel).
 *                  196 g/km equals ~12.2 km/L at 2.392 kg CO2/L (the contract's own per-litre figure).
 *   kWh/km values  ILLUSTRATIVE vehicle assumptions, not taken from a cited test cycle.
 *   urban mix 162  ILLUSTRATIVE fleet average, unverified.
 *   tree equiv.    ~22 kg CO2 per tree per year: a commonly quoted rough figure; real values vary widely.
 */

const MISSION_EV_MODEL = {
  version: '2026-10-26',
  gridGramsPerKWh: 727,
  solarGramsPerKWh: 48,
  treeKgPerYear: 22,
  gridSource: 'CEA CO2 Baseline Database, FY2023-24 weighted average 0.727 tCO2/MWh (as reported by SolarQuarter, Jan 2025; primary CEA table not re-verified)',
  solarSource: 'IPCC AR5 WG3 Annex III, utility-scale solar PV lifecycle median ~48 gCO2e/kWh (verify)',
  fossilSource: 'Project assumption mirroring EVMobilityRewards.sol tiers (196 / 224 g/km); not independently verified',

  // Demo reward / score rules. ILLUSTRATIVE and independent of the smart contract.
  demoPointsPerKgAvoided: 20,
  demoPointsModeBonus: { zero: 15, clean: 10, fossil: 0 },
  demoScoreRule: '+8 if avoided > 2 kg, +4 if > 0.5 kg, +2 if > 0 kg, −5 if the journey is not below the baseline'
};

const MISSION_EV_DATA = {
  model: MISSION_EV_MODEL,

  // kind 'electric' -> factor = kWhPerKm * (grid | solar) gCO2e/kWh
  // kind 'fixed'    -> factor = gPerKm
  emissionFactors: {
    ev_car: {
      id: 'ev_car', name: 'Electric Car (BEV)', category: 'clean', kind: 'electric',
      kWhPerKm: 0.152, unitNote: 'per vehicle-km',
      icon: 'zap', color: '#B8FF45', badge: 'Zero tailpipe, grid-powered'
    },
    ev_2w: {
      id: 'ev_2w', name: 'Electric 2-Wheeler (EV Scooter)', category: 'clean', kind: 'electric',
      kWhPerKm: 0.032, unitNote: 'per vehicle-km',
      icon: 'bike', color: '#20D89A', badge: 'High urban efficiency'
    },
    metro: {
      id: 'metro', name: 'Metro Transit (Passenger Rail)', category: 'clean', kind: 'electric',
      kWhPerKm: 0.040, unitNote: 'per passenger-km',
      icon: 'train', color: '#00F0FF', badge: 'Shared electric rail'
    },
    ebus: {
      id: 'ebus', name: 'Electric Bus (e-Bus)', category: 'clean', kind: 'electric',
      kWhPerKm: 1.1 / 32, unitNote: 'per passenger-km (1.1 kWh/km, 32 passengers assumed)',
      icon: 'bus', color: '#70FF94', badge: 'Shared electric fleet'
    },
    active: {
      id: 'active', name: 'Walking & Cycling', category: 'zero', kind: 'fixed',
      gPerKm: 0, unitNote: 'human powered',
      icon: 'footprints', color: '#E0FF85', badge: 'Zero direct emissions'
    },
    petrol_car: {
      id: 'petrol_car', name: 'Petrol Car (ICE Compact/Sedan)', category: 'fossil', kind: 'fixed',
      gPerKm: 196, unitNote: 'per vehicle-km (contract tier PETROL_REGULAR)',
      icon: 'car', color: '#FF6B4A', badge: 'Fossil fuel'
    },
    diesel_car: {
      id: 'diesel_car', name: 'Diesel SUV / Taxi', category: 'fossil', kind: 'fixed',
      gPerKm: 224, unitNote: 'per vehicle-km (contract tier DIESEL_SUV)',
      icon: 'truck', color: '#FF4136', badge: 'Fossil fuel, higher PM2.5 / NOx'
    }
  },

  baselines: {
    petrol_avg: { id: 'petrol_avg', name: 'Standard Petrol Sedan', factor_g_km: 196, notes: 'Project assumption (matches contract baseline)' },
    diesel_suv: { id: 'diesel_suv', name: 'Diesel SUV / App-Cab', factor_g_km: 224, notes: 'Project assumption (matches contract DIESEL_SUV tier)' },
    urban_mix:  { id: 'urban_mix',  name: 'Indian Urban Commute Average', factor_g_km: 162, notes: 'ILLUSTRATIVE fleet average, unverified' }
  },

  /** g CO2e per km for a mode, using the single set of constants above. */
  factorGramsPerKm: function (modeKey, useGreenTariff) {
    var m = this.emissionFactors[modeKey] || this.emissionFactors.ev_car;
    if (m.kind === 'electric') {
      var gridG = useGreenTariff ? MISSION_EV_MODEL.solarGramsPerKWh : MISSION_EV_MODEL.gridGramsPerKWh;
      return m.kWhPerKm * gridG;
    }
    return m.gPerKm;
  },

  /** Human-readable efficiency, generated from the constants so it can never disagree with them. */
  efficiencyText: function (modeKey) {
    var m = this.emissionFactors[modeKey];
    if (!m) return '';
    if (m.kind === 'electric') {
      var perPassenger = m.unitNote.indexOf('passenger') !== -1;
      return perPassenger ? m.kWhPerKm.toFixed(3) + ' kWh / passenger-km' : (m.kWhPerKm * 100).toFixed(1) + ' kWh / 100 km';
    }
    return m.gPerKm === 0 ? 'No fuel or electricity' : m.gPerKm + ' g CO2e / km';
  },

  // ---------- Core calculation ----------
  calculate: function (distanceKm, modeKey, baselineKey, useGreenTariff) {
    var mode = this.emissionFactors[modeKey] || this.emissionFactors.ev_car;
    var baseline = this.baselines[baselineKey] || this.baselines.petrol_avg;
    var dist = Math.max(0, parseFloat(distanceKm) || 0);
    var green = !!useGreenTariff;

    var factor = this.factorGramsPerKm(mode.id, green);
    var journeyKg = (dist * factor) / 1000;
    var baselineKg = (dist * baseline.factor_g_km) / 1000;
    var avoidedKg = baselineKg - journeyKg;                  // SIGNED difference

    var points = 0;
    if (avoidedKg > 0) {
      var bonus = MISSION_EV_MODEL.demoPointsModeBonus[mode.category] || 0;
      points = Math.round(avoidedKg * MISSION_EV_MODEL.demoPointsPerKgAvoided + bonus);
    }

    var scoreDelta;
    if (avoidedKg > 2.0) scoreDelta = 8;
    else if (avoidedKg > 0.5) scoreDelta = 4;
    else if (avoidedKg > 0) scoreDelta = 2;
    else scoreDelta = -5;

    return {
      distanceKm: dist,
      mode: mode,
      baseline: baseline,
      useGreenTariff: green,
      factor_g_km: factor,
      baseline_g_km: baseline.factor_g_km,
      journeyEmissionsKg: journeyKg,
      baselineEmissionsKg: baselineKg,
      avoidedKg: avoidedKg,
      isAboveBaseline: avoidedKg < 0,
      rewardPoints: points,
      scoreDelta: scoreDelta,
      treeDaysEquivalent: avoidedKg / (MISSION_EV_MODEL.treeKgPerYear / 365),
      percentReduction: baselineKg > 0 ? (avoidedKg / baselineKg) * 100 : 0
    };
  },

  /**
   * What the DEPLOYED CONTRACT would record for the same journey. Uses the contract's own
   * constants, so it intentionally differs from calculate() (e.g. EV = fixed 68 g/km).
   * Returns { supported:false } for journey types the contract cannot record.
   */
  onChainPreview: function (modeKey, distanceKm) {
    var rules = window.ONCHAIN_RULES;
    var support = window.ONCHAIN_SUPPORTED_MODES[modeKey];
    var km = Math.round(parseFloat(distanceKm) || 0);
    var out = { supported: !!support, modeKey: modeKey, distanceKm: km, method: support ? support.method : null };
    if (!support) return out;
    out.validDistance = km >= rules.minDistanceKm && km <= rules.maxDistanceKm;
    if (support.method === 'recordEVJourney') {
      out.avoidedGrams = (rules.baselineIceGramsPerKm - rules.evGridGramsPerKm) * km;
      out.tokenRewardIfFunded = rules.rewardTokensPerKm * km;
      out.scoreDelta = rules.scoreDeltaEv;
    } else {
      var tierName = support.vehicleType === window.VEHICLE_TYPE.DIESEL_SUV ? 'DIESEL_SUV' : 'PETROL_REGULAR';
      out.emittedGrams = rules.iceGramsPerKm[tierName] * km;
      out.tokenRewardIfFunded = 0;
      out.scoreDelta = rules.scoreDeltaIce;
    }
    return out;
  },

  /** Formatting helpers so every widget prints numbers the same way. */
  fmtKg: function (kg, decimals) {
    return (Math.abs(kg) < 0.005 ? 0 : kg).toFixed(decimals == null ? 2 : decimals);
  },
  fmtSignedKg: function (kg, decimals) {
    var v = Math.abs(kg) < 0.005 ? 0 : kg;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(decimals == null ? 2 : decimals);
  },

  // ---------- City scenarios (ILLUSTRATIVE INPUTS — not measurements or forecasts) ----------
  cities: {
    delhi: {
      id: 'delhi', name: 'Delhi NCR', dailyTrips: 24500000, avgTripKm: 11.2,
      context: 'Scenario inputs are illustrative placeholders, not census or transport-authority data.'
    },
    bengaluru: {
      id: 'bengaluru', name: 'Bengaluru Tech Corridor', dailyTrips: 13800000, avgTripKm: 9.6,
      context: 'Scenario inputs are illustrative placeholders, not census or transport-authority data.'
    },
    mumbai: {
      id: 'mumbai', name: 'Mumbai MMR', dailyTrips: 18200000, avgTripKm: 14.5,
      context: 'Scenario inputs are illustrative placeholders, not census or transport-authority data.'
    }
  },

  // Mix the "shifted" trips are assumed to move to (shares sum to 1). Documented on the page.
  cityCleanMix: { metro: 0.40, ebus: 0.20, ev_2w: 0.30, ev_car: 0.10 },
  cityBaselineKey: 'urban_mix',
  // Tailpipe PM2.5 per ICE km. ILLUSTRATIVE assumption, unverified.
  cityPm25GramsPerKm: 0.02,

  // ---------- DEMO sample profiles ----------
  // All people, wallets and histories below are FICTIONAL sample data. Per-trip emissions are
  // computed from the model above; the aggregates are fixed sample numbers.
  profiles: {
    aarav: {
      id: 'aarav', name: 'Aarav Sharma', tagline: 'EV Pioneer & Metro Commuter', avatar: 'AS', city: 'Delhi NCR',
      carbonScore: 842, scoreTier: 'Sample tier: Master', streakDays: 18, totalAvoidedKg: 142.8, totalTrips: 84,
      weeklyDistanceKm: 168.4, favoriteMode: 'ev_car', sampleTokenBalance: '1,428 demo points',
      trips: [
        { id: 'sample-1', date: 'Sample day 7', route: 'CyberHub → Connaught Place', distanceKm: 26.4, mode: 'ev_car' },
        { id: 'sample-2', date: 'Sample day 6', route: 'Barakhamba Road → Noida Sec 62', distanceKm: 18.2, mode: 'metro' },
        { id: 'sample-3', date: 'Sample day 5', route: 'Saket Metro → Hauz Khas Park', distanceKm: 4.8, mode: 'active' },
        { id: 'sample-4', date: 'Sample day 4', route: 'Aerocity → Dwarka Sector 21', distanceKm: 12.6, mode: 'ev_car' },
        { id: 'sample-5', date: 'Sample day 3', route: 'Nehru Place → Pragati Maidan', distanceKm: 9.8, mode: 'ebus' },
        { id: 'sample-6', date: 'Sample day 2', route: 'Gurgaon Sec 56 → DLF Phase 1', distanceKm: 6.2, mode: 'ev_2w' },
        { id: 'sample-7', date: 'Sample day 1', route: 'Noida Sec 18 → Okhla Phase 3', distanceKm: 11.5, mode: 'metro' }
      ]
    },
    priya: {
      id: 'priya', name: 'Priya Patel', tagline: 'Multimodal Urbanist & Cyclist', avatar: 'PP', city: 'Bengaluru',
      carbonScore: 785, scoreTier: 'Sample tier: Champion', streakDays: 9, totalAvoidedKg: 98.4, totalTrips: 62,
      weeklyDistanceKm: 122.0, favoriteMode: 'active', sampleTokenBalance: '984 demo points',
      trips: [
        { id: 'sample-11', date: 'Sample day 4', route: 'Indiranagar → Embassy GolfLinks', distanceKm: 6.8, mode: 'active' },
        { id: 'sample-12', date: 'Sample day 3', route: 'Domlur → Koramangala 4th Block', distanceKm: 4.5, mode: 'ev_2w' },
        { id: 'sample-13', date: 'Sample day 2', route: 'MG Road → Baiyappanahalli Metro', distanceKm: 8.2, mode: 'metro' },
        { id: 'sample-14', date: 'Sample day 1', route: 'Whitefield ITPL → Mahadevapura', distanceKm: 7.4, mode: 'ebus' }
      ]
    },
    rohan: {
      id: 'rohan', name: 'Rohan Verma', tagline: 'Hybrid Transitioner', avatar: 'RV', city: 'Mumbai',
      carbonScore: 590, scoreTier: 'Sample tier: Novice', streakDays: 4, totalAvoidedKg: 38.6, totalTrips: 31,
      weeklyDistanceKm: 94.5, favoriteMode: 'ev_car', sampleTokenBalance: '386 demo points',
      trips: [
        { id: 'sample-21', date: 'Sample day 2', route: 'BKC → Lower Parel', distanceKm: 14.2, mode: 'ev_car' },
        { id: 'sample-22', date: 'Sample day 1', route: 'Andheri West → Bandra West', distanceKm: 11.0, mode: 'petrol_car' }
      ]
    }
  },

  badges: [
    { id: 'badge-1', name: 'Zero Tailpipe Starter', icon: 'zap', desc: 'Sample badge: first 5 trips with electric propulsion', unlocked: true, date: 'sample' },
    { id: 'badge-2', name: 'Centurion Decarbonizer', icon: 'shield', desc: 'Sample badge: over 100 kg CO2e avoided vs the baseline', unlocked: true, date: 'sample' },
    { id: 'badge-3', name: 'Transit Maestro', icon: 'train', desc: 'Sample badge: Metro or e-bus for 10 consecutive weekdays', unlocked: true, date: 'sample' },
    { id: 'badge-4', name: 'Solar Grid Sync', icon: 'sun', desc: 'Sample badge: charge during midday solar hours', unlocked: false, progress: '3 / 5 trips (sample)' },
    { id: 'badge-5', name: '30-Day Clean Streak', icon: 'flame', desc: 'Sample badge: 30 uninterrupted days of clean commuting', unlocked: false, progress: '18 / 30 days (sample)' },
    { id: 'badge-6', name: '1,000 Demo Points', icon: 'award', desc: 'Sample badge: 1,000 demo reward points. Not on-chain tokens.', unlocked: true, date: 'sample' }
  ],

  // Entirely fictional sample leaderboard.
  leaderboard: [
    { rank: 1, name: 'Ananya S.', avatar: 'AS', city: 'Bengaluru', avoidedKg: 312.4, score: 968, streak: 42, badge: 'Sample' },
    { rank: 2, name: 'Vikram Joshi', avatar: 'VJ', city: 'Delhi NCR', avoidedKg: 284.1, score: 942, streak: 35, badge: 'Sample' },
    { rank: 3, name: 'Simran Kaur', avatar: 'SK', city: 'Mumbai', avoidedKg: 246.8, score: 915, streak: 28, badge: 'Sample' },
    { rank: 4, name: 'Aarav Sharma (sample profile)', avatar: 'AS', city: 'Delhi NCR', avoidedKg: 142.8, score: 842, streak: 18, badge: 'Sample', isSampleProfile: true },
    { rank: 5, name: 'Devendra P.', avatar: 'DP', city: 'Pune', avoidedKg: 139.2, score: 830, streak: 14, badge: 'Sample' },
    { rank: 6, name: 'Priya Patel', avatar: 'PP', city: 'Bengaluru', avoidedKg: 98.4, score: 785, streak: 9, badge: 'Sample' }
  ]
};

// Derive every sample trip's numbers from the model so they can never drift from it.
Object.keys(MISSION_EV_DATA.profiles).forEach(function (pid) {
  MISSION_EV_DATA.profiles[pid].trips.forEach(function (t) {
    var r = MISSION_EV_DATA.calculate(t.distanceKm, t.mode, 'petrol_avg', false);
    t.actualKg = r.journeyEmissionsKg;
    t.baselineKg = r.baselineEmissionsKg;
    t.avoidedKg = r.avoidedKg;
    t.points = r.rewardPoints;
    t.status = 'Sample trip (not on-chain)';
  });
});

window.MISSION_EV_MODEL = MISSION_EV_MODEL;
window.MISSION_EV_DATA = MISSION_EV_DATA;
