/**
 * MissionEV - Chapter 01 route comparison, Chapter 07 city scenario, and the methodology panel.
 * All emissions come from MISSION_EV_DATA.calculate() / factorGramsPerKm(); nothing is typed in by hand.
 */

(function () {
  'use strict';

  var DATA = window.MISSION_EV_DATA;
  var MODEL = window.MISSION_EV_MODEL;

  var currentCityKey = 'delhi';
  var targetCleanShiftPct = 35;

  // Example corridors. Distance and the two modes are inputs; every emission value is computed.
  var routeComparisons = [
    { title: 'Delhi NCR: CyberHub → Connaught Place', distanceKm: 26.4, baselineKey: 'petrol_avg', cleanMode: 'ev_car' },
    { title: 'Bengaluru: Electronic City → Indiranagar', distanceKm: 18.5, baselineKey: 'diesel_suv', cleanMode: 'ev_2w' },
    { title: 'Mumbai: Borivali → BKC', distanceKm: 28.0, baselineKey: 'petrol_avg', cleanMode: 'metro' }
  ];

  function init() {
    setupProblemDualRoute();
    setupCitySimulator();
    setupRoadmapAccordion();
    updateCityCalculations();
    renderMethodology();
  }

  /* ---------- Chapter 01 ---------- */
  function setupProblemDualRoute() {
    var buttons = document.querySelectorAll('.problem-route-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        displayRouteComparison(parseInt(btn.getAttribute('data-route-index'), 10));
      });
    });
    displayRouteComparison(0);
  }

  function displayRouteComparison(index) {
    var r = routeComparisons[index] || routeComparisons[0];
    var res = DATA.calculate(r.distanceKm, r.cleanMode, r.baselineKey, false);

    setText('probIceVehicle', res.baseline.name + ' (' + res.baseline_g_km + ' g/km)');
    setText('probIceCo2', DATA.fmtKg(res.baselineEmissionsKg) + ' kg CO2e');
    setText('probIceCost', res.baseline_g_km + ' g CO2e/km');

    setText('probCleanVehicle', res.mode.name + ' (' + res.factor_g_km.toFixed(1) + ' g/km)');
    setText('probCleanCo2', DATA.fmtKg(res.journeyEmissionsKg) + ' kg CO2e');
    setText('probCleanCost', res.factor_g_km.toFixed(1) + ' g CO2e/km');

    setText('probAvoidedDelta', DATA.fmtSignedKg(res.avoidedKg) + ' kg CO2e over ' + r.distanceKm + ' km');
    setText('probMethodologySource', r.title + ' · illustrative route · factors: see methodology');

    var maxKg = Math.max(res.baselineEmissionsKg, res.journeyEmissionsKg, 0.001);
    var iceBar = document.getElementById('probIceBar');
    var cleanBar = document.getElementById('probCleanBar');
    if (iceBar) iceBar.style.width = Math.round((res.baselineEmissionsKg / maxKg) * 100) + '%';
    if (cleanBar) cleanBar.style.width = Math.round((res.journeyEmissionsKg / maxKg) * 100) + '%';
  }

  /* ---------- Chapter 07 ---------- */
  function setupCitySimulator() {
    var cityButtons = document.querySelectorAll('.city-select-btn');
    cityButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        cityButtons.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        currentCityKey = btn.getAttribute('data-city');
        updateCityCalculations();
      });
    });

    var slider = document.getElementById('cityShiftSlider');
    var display = document.getElementById('cityShiftDisplay');
    if (slider) {
      slider.addEventListener('input', function () {
        targetCleanShiftPct = parseInt(slider.value, 10);
        if (display) display.textContent = targetCleanShiftPct + '%';
        updateCityCalculations();
      });
    }
  }

  function cleanMixFactor() {
    var mix = DATA.cityCleanMix;
    return Object.keys(mix).reduce(function (sum, k) { return sum + mix[k] * DATA.factorGramsPerKm(k, false); }, 0);
  }

  function updateCityCalculations() {
    var city = DATA.cities[currentCityKey] || DATA.cities.delhi;
    var base = DATA.baselines[DATA.cityBaselineKey];
    var mixG = cleanMixFactor();

    var shiftedTripsDaily = city.dailyTrips * (targetCleanShiftPct / 100);
    var perTripKg = (city.avgTripKm * (base.factor_g_km - mixG)) / 1000;              // baseline − clean mix
    var annualTonnes = (shiftedTripsDaily * perTripKg * 365) / 1000;
    var annualPm25Kg = (shiftedTripsDaily * city.avgTripKm * DATA.cityPm25GramsPerKm * 365) / 1000;

    setText('citySimContext', city.context);
    setText('cityAnnualCo2Avoided', Math.round(annualTonnes).toLocaleString('en-IN') + ' t CO2e / year');
    setText('cityTripsShifted', (shiftedTripsDaily / 1e6).toFixed(2) + 'M / day');
    setText('cityPerTripKg', DATA.fmtSignedKg(perTripKg) + ' kg CO2e (' + city.avgTripKm + ' km trip)');
    setText('cityPm25Reduced', Math.round(annualPm25Kg).toLocaleString('en-IN') + ' kg / year');
    setText('citySimShiftLabel', targetCleanShiftPct + '% of daily trips move to the clean mix below');

    var list = document.getElementById('cityAssumptions');
    if (list) {
      var mix = DATA.cityCleanMix;
      var mixText = Object.keys(mix).map(function (k) { return Math.round(mix[k] * 100) + '% ' + DATA.emissionFactors[k].name; }).join(', ');
      list.innerHTML =
        '<b>Assumptions (all illustrative):</b><ul>' +
        '<li>Trips per day and average trip length for ' + city.name + ' are placeholder inputs, not census or transport-authority data.</li>' +
        '<li>Baseline for shifted trips: ' + base.name + ', ' + base.factor_g_km + ' g CO2e/km (unverified).</li>' +
        '<li>Clean mix the shifted trips move to: ' + mixText + '. Blended factor: ' + mixG.toFixed(1) + ' g CO2e/km (grid electricity at ' + MODEL.gridGramsPerKWh + ' g/kWh).</li>' +
        '<li>Result = trips shifted × trip length × (baseline − clean mix) × 365. No rebound effects, mode-share dynamics, vehicle turnover or grid change are modelled.</li>' +
        '<li>PM2.5 uses an assumed ' + DATA.cityPm25GramsPerKm + ' g per fossil-vehicle km, unverified. No health or monetary valuation is shown because none is validated.</li>' +
        '</ul>';
    }
  }

  function setupRoadmapAccordion() {
    var items = document.querySelectorAll('.roadmap-item');
    items.forEach(function (item) {
      var header = item.querySelector('.roadmap-header');
      if (header) {
        header.addEventListener('click', function () {
          var wasOpen = item.classList.contains('expanded');
          items.forEach(function (it) { it.classList.remove('expanded'); });
          if (!wasOpen) item.classList.add('expanded');
        });
      }
    });
  }

  /* ---------- Methodology & data status (generated from the real constants) ---------- */
  function renderMethodology() {
    var box = document.getElementById('methodologyBody');
    if (!box) return;
    var R = window.ONCHAIN_RULES;

    var rows = Object.keys(DATA.emissionFactors).map(function (k) {
      var m = DATA.emissionFactors[k];
      var src = m.kind === 'electric'
        ? DATA.efficiencyText(k) + ' (' + m.unitNote + '), illustrative'
        : (m.gPerKm === 0 ? 'no fuel or electricity' : 'project assumption, mirrors contract tier');
      return '<tr><td>' + m.name + '</td><td>' + DATA.factorGramsPerKm(k, false).toFixed(1) + '</td><td>' +
        (m.kind === 'electric' ? DATA.factorGramsPerKm(k, true).toFixed(1) : '—') + '</td><td>' + src + '</td></tr>';
    }).join('');

    var baseRows = Object.keys(DATA.baselines).map(function (k) {
      var b = DATA.baselines[k];
      return '<tr><td>' + b.name + '</td><td>' + b.factor_g_km + '</td><td>' + b.notes + '</td></tr>';
    }).join('');

    var status = [
      ['Emissions model and charts', 'IMPLEMENTED', 'Runs in your browser from the constants above.'],
      ['Profiles, trips, badges, leaderboard, score history', 'DEMO DATA', 'Fictional samples. Trip emissions are computed; aggregates are fixed sample numbers.'],
      ['Demo reward points and demo score', 'DEMO RULE', 'Illustrative rule, separate from the contract rule below.'],
      ['Wallet connection (EIP-1193)', 'IMPLEMENTED', 'Needs a browser wallet. Never asks for keys or seed phrases.'],
      ['Portal V3 chain config (chain 420420777, RPC)', 'VERIFIED AT BUILD TIME', 'RPC answered eth_chainId = 0x190f1ca9 on 2026-10-26. Re-checked live in the config panel.'],
      ['EVMobilityRewards deployment', 'NOT VERIFIED', 'No address with bytecode is configured. On-chain submit stays disabled until one is.'],
      ['Azure Functions, Maps, Event Hubs, Cosmos DB, Power BI, oracle', 'PLANNED', 'Not implemented, not configured, no health status.']
    ].map(function (r) {
      return '<tr><td>' + r[0] + '</td><td><span class="chip-tag">' + r[1] + '</span></td><td>' + r[2] + '</td></tr>';
    }).join('');

    box.innerHTML =
      '<div class="method-block"><h4>Definition</h4>' +
      '<p>Emissions (kg CO2e) = distance (km) × factor (g CO2e/km) ÷ 1000. <b>Avoided = baseline − selected journey.</b> Positive means the journey emits less; negative means it emits more than the baseline. Electric factor = kWh/km × grid factor (g/kWh). Shared transit is per passenger-km. This is a modelled difference, <b>not a certified carbon credit</b>.</p></div>' +

      '<div class="method-block"><h4>Emission factors (g CO2e per km)</h4>' +
      '<div class="table-scroll"><table class="method-table"><thead><tr><th>Mode</th><th>Grid</th><th>Solar</th><th>Basis</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="method-note">Grid factor ' + MODEL.gridGramsPerKWh + ' g/kWh: ' + MODEL.gridSource + '. Solar ' + MODEL.solarGramsPerKWh + ' g/kWh: ' + MODEL.solarSource + '. Fossil: ' + MODEL.fossilSource + '. kWh/km values are illustrative assumptions, not from a cited test cycle.</p></div>' +

      '<div class="method-block"><h4>Baselines</h4>' +
      '<div class="table-scroll"><table class="method-table"><thead><tr><th>Baseline</th><th>g CO2e/km</th><th>Status</th></tr></thead><tbody>' + baseRows + '</tbody></table></div></div>' +

      '<div class="method-block"><h4>Demo score, streak and points (browser only)</h4>' +
      '<p>Demo points = ' + MODEL.demoPointsPerKgAvoided + ' per kg avoided + mode bonus (' + MODEL.demoPointsModeBonus.zero + ' walking/cycling, ' + MODEL.demoPointsModeBonus.clean + ' other clean modes), and 0 when nothing is avoided. Demo score change: ' + MODEL.demoScoreRule + '. Sample profile streaks and scores are fixed fictional numbers. Tree equivalence uses ~' + MODEL.treeKgPerYear + ' kg CO2 per tree-year, a rough figure.</p></div>' +

      '<div class="method-block"><h4>What the contract does (EVMobilityRewards.sol)</h4>' +
      '<ul>' +
      '<li><b>EV journey:</b> distance ' + R.minDistanceKm + ' to ' + R.maxDistanceKm + ' km, unique journey ID. Records (' + R.baselineIceGramsPerKm + ' − ' + R.evGridGramsPerKm + ') = ' + (R.baselineIceGramsPerKm - R.evGridGramsPerKm) + ' g per km as avoided, score +' + R.scoreDeltaEv + ' (starts at ' + R.scoreStart + ', max 1000), streak +1 if the previous journey was within 36 hours. Sends ' + R.rewardTokensPerKm + ' tokens per km travelled only if the contract already holds enough of the reward token. It never mints.</li>' +
      '<li><b>Petrol / diesel journey:</b> records ' + R.iceGramsPerKm.PETROL_REGULAR + ' / ' + R.iceGramsPerKm.DIESEL_SUV + ' g per km as emitted, score ' + R.scoreDeltaIce + ', streak reset. <b>No tokens are burned, deducted or transferred.</b></li>' +
      '<li>Distance is self-reported; the oracle role exists but is unused. The contract\'s EV factor (' + R.evGridGramsPerKm + ' g/km) is fixed and differs from the lab\'s electricity-based figure (' + DATA.factorGramsPerKm('ev_car', false).toFixed(1) + ' g/km), so on-chain "avoided" values will not match the lab.</li>' +
      '<li>Only Electric Car, Petrol Car and Diesel SUV can be submitted. Two-wheeler, metro, e-bus and walking/cycling have no contract method and stay demo-only.</li>' +
      '</ul></div>' +

      '<div class="method-block"><h4>Component status</h4>' +
      '<div class="table-scroll"><table class="method-table"><thead><tr><th>Component</th><th>Status</th><th>Notes</th></tr></thead><tbody>' + status + '</tbody></table></div></div>';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
