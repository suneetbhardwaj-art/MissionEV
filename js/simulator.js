/**
 * MissionEV - Chapter 03: Interactive Mobility Lab
 * Every number shown here comes from MISSION_EV_DATA.calculate() (see data.js).
 * After each recalculation a 'missionev:lab-updated' event is dispatched so the transaction
 * preview and the Portal V3 module read the SAME result instead of recomputing it.
 */

(function () {
  'use strict';

  var DATA = window.MISSION_EV_DATA;
  var MAX_KM = 200;

  var state = {
    mode: 'ev_car',
    distanceKm: 25,
    baseline: 'petrol_avg',
    useGreenTariff: false,
    weeklyMix: { ev: 45, metro: 30, active: 15, fossil: 10 },
    weeklyTotalKm: 180,
    selectedTimelineTripIndex: 0,
    last: null
  };

  // Sample journeys. Distances and modes are fixed; every emission figure is computed.
  var timelineTrips = [
    { title: 'Morning Commute', route: 'CyberHub → Central Delhi', km: 26.4, mode: 'ev_car', time: 'Sample 08:30' },
    { title: 'Client Meeting Run', route: 'Connaught Place → Noida Sec 62', km: 18.2, mode: 'metro', time: 'Sample 13:15' },
    { title: 'Lunch Errands', route: 'Sector 18 Hub Loop', km: 3.5, mode: 'active', time: 'Sample 14:30' },
    { title: 'Evening Return', route: 'Noida Sec 62 → CyberHub', km: 28.0, mode: 'ev_car', time: 'Sample 19:15' }
  ];

  function clampKm(v) {
    var n = parseFloat(v);
    if (isNaN(n)) n = 1;
    return Math.min(MAX_KM, Math.max(1, n));
  }

  function init() {
    populateBaselineSelect();
    setupEventListeners();
    updateCalculations();
    renderWeeklyMix();
    renderTimeline();
    window.MISSION_EV_LAB = {
      getState: function () { return { mode: state.mode, distanceKm: state.distanceKm, baseline: state.baseline, useGreenTariff: state.useGreenTariff }; },
      getResult: function () { return state.last; }
    };
    document.dispatchEvent(new CustomEvent('missionev:lab-updated', { detail: state.last }));
  }

  // Option labels are generated from the model so they can never disagree with it.
  function populateBaselineSelect() {
    var sel = document.getElementById('labBaselineSelect');
    if (!sel) return;
    sel.innerHTML = '';
    Object.keys(DATA.baselines).forEach(function (k) {
      var b = DATA.baselines[k];
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = b.name + ' (' + b.factor_g_km + ' g CO2e/km)';
      if (k === state.baseline) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function syncPresetHighlight() {
    document.querySelectorAll('.dist-preset-btn').forEach(function (b) {
      b.classList.toggle('active', parseFloat(b.getAttribute('data-km')) === state.distanceKm);
    });
  }

  function setupEventListeners() {
    var modeButtons = document.querySelectorAll('.lab-mode-btn');
    modeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        modeButtons.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.mode = btn.getAttribute('data-mode');
        updateCalculations();
      });
    });

    var distSlider = document.getElementById('labDistanceSlider');
    var distNumber = document.getElementById('labDistanceNumber');
    if (distSlider && distNumber) {
      distSlider.max = MAX_KM;
      distNumber.max = MAX_KM;
      distSlider.addEventListener('input', function () {
        distNumber.value = distSlider.value;
        state.distanceKm = clampKm(distSlider.value);
        syncPresetHighlight();
        updateCalculations();
      });
      distNumber.addEventListener('input', function () {
        if (distNumber.value === '') return;      // allow clearing while typing
        state.distanceKm = clampKm(distNumber.value);
        distSlider.value = state.distanceKm;
        syncPresetHighlight();
        updateCalculations();
      });
      distNumber.addEventListener('change', function () {
        state.distanceKm = clampKm(distNumber.value);
        distNumber.value = state.distanceKm;    // show the value actually used
        distSlider.value = state.distanceKm;
        syncPresetHighlight();
        updateCalculations();
      });
    }

    document.querySelectorAll('.dist-preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var km = clampKm(btn.getAttribute('data-km'));
        state.distanceKm = km;
        if (distSlider) distSlider.value = km;
        if (distNumber) distNumber.value = km;
        syncPresetHighlight();
        updateCalculations();
      });
    });

    var baselineSelect = document.getElementById('labBaselineSelect');
    if (baselineSelect) {
      baselineSelect.addEventListener('change', function () {
        state.baseline = baselineSelect.value;
        updateCalculations();
        renderWeeklyMix();
      });
    }

    var greenToggle = document.getElementById('labGreenToggle');
    if (greenToggle) {
      greenToggle.addEventListener('change', function () {
        state.useGreenTariff = greenToggle.checked;
        updateCalculations();
        renderWeeklyMix();
      });
    }

    var resetBtn = document.getElementById('labResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state.mode = 'ev_car';
        state.distanceKm = 25;
        state.baseline = 'petrol_avg';
        state.useGreenTariff = false;
        state.weeklyMix = { ev: 45, metro: 30, active: 15, fossil: 10 };
        state.weeklyTotalKm = 180;

        modeButtons.forEach(function (b) {
          var isDefault = b.getAttribute('data-mode') === 'ev_car';
          b.classList.toggle('active', isDefault);
          b.setAttribute('aria-pressed', isDefault ? 'true' : 'false');
        });
        if (distSlider) distSlider.value = 25;
        if (distNumber) distNumber.value = 25;
        if (baselineSelect) baselineSelect.value = 'petrol_avg';
        if (greenToggle) greenToggle.checked = false;
        [['mixEvSlider', 45], ['mixMetroSlider', 30], ['mixActiveSlider', 15], ['mixFossilSlider', 10]].forEach(function (p) {
          var el = document.getElementById(p[0]);
          if (el) el.value = p[1];
        });
        var wk = document.getElementById('weeklyDistanceInput');
        if (wk) wk.value = 180;

        syncPresetHighlight();
        updateCalculations();
        renderWeeklyMix();
        showNotification('Mobility Lab reset to defaults');
      });
    }

    var mixIds = { mixEvSlider: 'ev', mixMetroSlider: 'metro', mixActiveSlider: 'active', mixFossilSlider: 'fossil' };
    Object.keys(mixIds).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        state.weeklyMix[mixIds[id]] = parseInt(el.value, 10) || 0;
        renderWeeklyMix();
      });
    });

    var weekKmInput = document.getElementById('weeklyDistanceInput');
    if (weekKmInput) {
      weekKmInput.addEventListener('input', function () {
        state.weeklyTotalKm = Math.max(10, parseFloat(weekKmInput.value) || 10);
        renderWeeklyMix();
      });
    }
  }

  function updateCalculations() {
    var res = DATA.calculate(state.distanceKm, state.mode, state.baseline, state.useGreenTariff);
    state.last = res;

    setText('labActualKg', DATA.fmtKg(res.journeyEmissionsKg) + ' kg');
    setText('labBaselineKg', DATA.fmtKg(res.baselineEmissionsKg) + ' kg');
    setText('labAvoidedKg', DATA.fmtSignedKg(res.avoidedKg) + ' kg');
    setText('labRewardTokens', '+' + res.rewardPoints + ' pts');

    var avoidedEl = document.getElementById('labAvoidedKg');
    if (avoidedEl) {
      avoidedEl.classList.toggle('hl', !res.isAboveBaseline);
      avoidedEl.style.color = res.isAboveBaseline ? 'var(--coral)' : '';
    }

    var note;
    if (res.avoidedKg > 0.0049) {
      note = 'Avoided = baseline − journey. This journey emits ' + DATA.fmtKg(res.avoidedKg) + ' kg LESS than the baseline.';
    } else if (res.avoidedKg < -0.0049) {
      note = 'Negative: this journey emits ' + DATA.fmtKg(-res.avoidedKg) + ' kg MORE than the selected baseline, so nothing is avoided and no demo points are earned.';
    } else {
      note = 'This journey emits the same as the selected baseline, so nothing is avoided.';
    }
    setText('labAvoidedNote', note);

    setText('labFactorLine',
      'Factor used: ' + res.factor_g_km.toFixed(1) + ' g CO2e/km (' + factorExplanation(res) + ') vs baseline ' + res.baseline_g_km + ' g CO2e/km. ' +
      'Demo points: ' + DATA.model.demoPointsPerKgAvoided + ' per kg avoided + mode bonus (illustrative, not the contract rule). ' +
      'Demo score change: ' + (res.scoreDelta > 0 ? '+' : '') + res.scoreDelta + '.');

    setText('labModeName', res.mode.name);
    setText('labModeBadge', res.mode.badge);
    setText('labEfficiency', DATA.efficiencyText(res.mode.id));

    var greenHint = document.getElementById('labGreenHint');
    if (greenHint) {
      greenHint.textContent = 'Electric modes only: uses ' + DATA.model.solarGramsPerKWh + ' g CO2e/kWh (solar lifecycle) instead of the ' +
        DATA.model.gridGramsPerKWh + ' g CO2e/kWh grid average. Fossil and walking/cycling are unaffected.';
    }

    renderEmissionsChart(res);
    refreshTimelineNotes();

    document.dispatchEvent(new CustomEvent('missionev:lab-updated', { detail: res }));
  }

  function factorExplanation(res) {
    var m = res.mode;
    if (m.kind === 'electric') {
      return m.kWhPerKm.toFixed(3) + ' kWh/km × ' + (res.useGreenTariff ? DATA.model.solarGramsPerKWh : DATA.model.gridGramsPerKWh) + ' g/kWh';
    }
    return m.gPerKm === 0 ? 'no direct emissions' : 'fixed project factor';
  }

  /** Visualization A: SVG comparison. Heights come straight from the computed result. */
  function renderEmissionsChart(res) {
    var chartContainer = document.getElementById('labComparisonSvg');
    if (!chartContainer) return;

    var chartH = 180;
    var maxVal = Math.max(res.baselineEmissionsKg, res.journeyEmissionsKg, 0.5) * 1.25;
    var barWidth = 64;
    var baselineHeight = (res.baselineEmissionsKg / maxVal) * 130;
    var actualHeight = (res.journeyEmissionsKg / maxVal) * 130;
    var baselineY = chartH - 30 - baselineHeight;
    var actualY = chartH - 30 - actualHeight;
    var above = res.isAboveBaseline;

    var svg = '<svg viewBox="0 0 560 ' + chartH + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Emissions comparison chart">';
    svg += '<line x1="40" y1="' + (chartH - 30) + '" x2="540" y2="' + (chartH - 30) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>';
    svg += '<line x1="40" y1="' + (chartH - 95) + '" x2="540" y2="' + (chartH - 95) + '" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" stroke-width="1"/>';
    svg += '<line x1="40" y1="' + (chartH - 160) + '" x2="540" y2="' + (chartH - 160) + '" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" stroke-width="1"/>';

    var bar1X = 80;
    svg += '<g class="chart-bar-group" tabindex="0" data-tooltip="Baseline (' + res.baseline.name + '): ' + DATA.fmtKg(res.baselineEmissionsKg) + ' kg CO2e at ' + res.baseline_g_km + ' g/km">';
    svg += '<rect x="' + bar1X + '" y="' + baselineY + '" width="' + barWidth + '" height="' + Math.max(baselineHeight, 2) + '" rx="6" fill="#FF5B3A" opacity="0.85" />';
    svg += '<text x="' + (bar1X + barWidth / 2) + '" y="' + (baselineY - 8) + '" text-anchor="middle" fill="#FF5B3A" font-size="12" font-family="DM Mono" font-weight="600">' + DATA.fmtKg(res.baselineEmissionsKg) + ' kg</text>';
    svg += '<text x="' + (bar1X + barWidth / 2) + '" y="' + (chartH - 12) + '" text-anchor="middle" fill="#94A79A" font-size="11" font-family="Space Grotesk">Baseline</text>';
    svg += '</g>';

    var bar2X = 260;
    var actualColor = above || res.mode.category === 'fossil' ? '#FF5B3A' : '#B8FF45';
    svg += '<g class="chart-bar-group" tabindex="0" data-tooltip="' + res.mode.name + ': ' + DATA.fmtKg(res.journeyEmissionsKg) + ' kg CO2e at ' + res.factor_g_km.toFixed(1) + ' g/km">';
    svg += '<rect x="' + bar2X + '" y="' + actualY + '" width="' + barWidth + '" height="' + Math.max(actualHeight, 4) + '" rx="6" fill="' + actualColor + '" />';
    svg += '<text x="' + (bar2X + barWidth / 2) + '" y="' + (actualY - 8) + '" text-anchor="middle" fill="' + actualColor + '" font-size="12" font-family="DM Mono" font-weight="600">' + DATA.fmtKg(res.journeyEmissionsKg) + ' kg</text>';
    svg += '<text x="' + (bar2X + barWidth / 2) + '" y="' + (chartH - 12) + '" text-anchor="middle" fill="' + actualColor + '" font-size="11" font-family="Space Grotesk">Selected</text>';
    svg += '</g>';

    var diffColor = above ? '#FF5B3A' : '#20D89A';
    if (Math.abs(res.avoidedKg) >= 0.005) {
      var bracketX = bar2X + barWidth + 14;
      var bracketEndX = bracketX + 12;
      var topY = Math.min(baselineY, actualY);
      var botY = Math.max(baselineY, actualY);
      svg += '<g class="avoided-bracket">';
      svg += '<line x1="' + bracketX + '" y1="' + topY + '" x2="' + bracketEndX + '" y2="' + topY + '" stroke="' + diffColor + '" stroke-width="1.5"/>';
      svg += '<line x1="' + bracketEndX + '" y1="' + topY + '" x2="' + bracketEndX + '" y2="' + botY + '" stroke="' + diffColor + '" stroke-width="1.5" stroke-dasharray="3,2"/>';
      svg += '<line x1="' + bracketX + '" y1="' + botY + '" x2="' + bracketEndX + '" y2="' + botY + '" stroke="' + diffColor + '" stroke-width="1.5"/>';
      var midY = topY + (botY - topY) / 2;
      svg += '<text x="' + (bracketEndX + 8) + '" y="' + (midY + 4) + '" fill="' + diffColor + '" font-size="11" font-family="DM Mono" font-weight="700">' + DATA.fmtSignedKg(res.avoidedKg) + ' kg</text>';
      svg += '<text x="' + (bracketEndX + 8) + '" y="' + (midY + 18) + '" fill="' + diffColor + '" font-size="10" font-family="DM Mono">' + (above ? 'ABOVE BASELINE' : 'AVOIDED') + '</text>';
      svg += '</g>';
    }
    svg += '</svg>';
    chartContainer.innerHTML = svg;

    chartContainer.querySelectorAll('.chart-bar-group').forEach(function (bg) {
      bg.addEventListener('mouseenter', function (e) { showChartTooltip(bg.getAttribute('data-tooltip'), e.clientX, e.clientY); });
      bg.addEventListener('mouseleave', hideChartTooltip);
      bg.addEventListener('focus', function () {
        var r = bg.getBoundingClientRect();
        showChartTooltip(bg.getAttribute('data-tooltip'), r.left, r.top);
      });
      bg.addEventListener('blur', hideChartTooltip);
    });
  }

  /** Visualization B: weekly mix, built from the same factors and the same baseline. */
  function renderWeeklyMix() {
    var mix = state.weeklyMix;
    var total = mix.ev + mix.metro + mix.active + mix.fossil;
    var n = function (v) { return total > 0 ? v / total : 0; };
    var shares = { ev: n(mix.ev), metro: n(mix.metro), active: n(mix.active), fossil: n(mix.fossil) };

    var km = state.weeklyTotalKm;
    var base = DATA.baselines[state.baseline] || DATA.baselines.petrol_avg;
    var g = state.useGreenTariff;
    var weeklyActualG = km * (
      shares.ev * DATA.factorGramsPerKm('ev_car', g) +
      shares.metro * DATA.factorGramsPerKm('metro', g) +
      shares.active * DATA.factorGramsPerKm('active', g) +
      shares.fossil * DATA.factorGramsPerKm('petrol_car', g)
    );
    var weeklyBaselineKg = (km * base.factor_g_km) / 1000;
    var weeklyDiffKg = weeklyBaselineKg - weeklyActualG / 1000;     // signed: baseline − mix
    var annualKg = weeklyDiffKg * 52;
    var trees = annualKg / DATA.model.treeKgPerYear;

    setText('mixWeeklyAvoided', DATA.fmtSignedKg(weeklyDiffKg, 1) + ' kg CO2e vs baseline');
    setText('mixAnnualAvoided', (annualKg >= 0 ? '+' : '−') + Math.abs(annualKg / 1000).toFixed(2) + ' t CO2e / yr');
    setText('mixTreesEquiv', (trees >= 0 ? '≈ ' : '≈ −') + Math.abs(trees).toFixed(1) + ' tree-years (rough equivalence)');

    setText('mixEvPct', Math.round(shares.ev * 100) + '%');
    setText('mixMetroPct', Math.round(shares.metro * 100) + '%');
    setText('mixActivePct', Math.round(shares.active * 100) + '%');
    setText('mixFossilPct', Math.round(shares.fossil * 100) + '%');

    var barEl = document.getElementById('mixDistributionBar');
    if (barEl) {
      barEl.innerHTML =
        '<div style="width:' + (shares.ev * 100) + '%; background:#B8FF45;" title="EV: ' + Math.round(shares.ev * 100) + '%"></div>' +
        '<div style="width:' + (shares.metro * 100) + '%; background:#00F0FF;" title="Metro: ' + Math.round(shares.metro * 100) + '%"></div>' +
        '<div style="width:' + (shares.active * 100) + '%; background:#E0FF85;" title="Active: ' + Math.round(shares.active * 100) + '%"></div>' +
        '<div style="width:' + (shares.fossil * 100) + '%; background:#FF5B3A;" title="ICE: ' + Math.round(shares.fossil * 100) + '%"></div>';
    }
  }

  /** Visualization C: sample journeys. Notes are computed from the model, not typed. */
  function tripNote(trip) {
    var r = DATA.calculate(trip.km, trip.mode, state.baseline, state.useGreenTariff);
    if (r.avoidedKg >= 0.005) return DATA.fmtKg(r.avoidedKg) + ' kg CO2e avoided vs ' + r.baseline.name;
    if (r.avoidedKg <= -0.005) return DATA.fmtKg(-r.avoidedKg) + ' kg CO2e above ' + r.baseline.name;
    return 'Same as ' + r.baseline.name;
  }

  function renderTimeline() {
    var container = document.getElementById('timelineList');
    if (!container) return;

    var html = '';
    timelineTrips.forEach(function (trip, idx) {
      var modeObj = DATA.emissionFactors[trip.mode];
      html += '<div class="timeline-trip-item ' + (idx === state.selectedTimelineTripIndex ? 'active' : '') + '" data-index="' + idx + '" tabindex="0" role="button">';
      html += '<div class="timeline-bullet" style="background:' + modeObj.color + '"></div>';
      html += '<div class="timeline-info">';
      html += '<div class="timeline-row"><b class="t-name">' + trip.title + '</b><span class="t-time">' + trip.time + '</span></div>';
      html += '<div class="t-route">' + trip.route + ' (' + trip.km + ' km)</div>';
      html += '<div class="t-note hl">' + tripNote(trip) + '</div>';
      html += '</div>';
      html += '<span class="timeline-load-btn btn sm ghost" aria-hidden="true">LOAD TRIP</span>';
      html += '</div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.timeline-trip-item').forEach(function (item) {
      var load = function () { selectTimelineTrip(parseInt(item.getAttribute('data-index'), 10)); };
      item.addEventListener('click', load);
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(); }
      });
    });
    updateTimelineDetail(timelineTrips[state.selectedTimelineTripIndex]);
  }

  function refreshTimelineNotes() {
    var notes = document.querySelectorAll('#timelineList .t-note');
    notes.forEach(function (el, i) { if (timelineTrips[i]) el.textContent = tripNote(timelineTrips[i]); });
  }

  function selectTimelineTrip(idx) {
    state.selectedTimelineTripIndex = idx;
    var trip = timelineTrips[idx];
    if (!trip) return;

    document.querySelectorAll('.timeline-trip-item').forEach(function (it, i) { it.classList.toggle('active', i === idx); });

    state.mode = trip.mode;
    state.distanceKm = clampKm(trip.km);

    var distSlider = document.getElementById('labDistanceSlider');
    var distNumber = document.getElementById('labDistanceNumber');
    if (distSlider) distSlider.value = state.distanceKm;
    if (distNumber) distNumber.value = state.distanceKm;

    document.querySelectorAll('.lab-mode-btn').forEach(function (b) {
      var matched = b.getAttribute('data-mode') === trip.mode;
      b.classList.toggle('active', matched);
      b.setAttribute('aria-pressed', matched ? 'true' : 'false');
    });

    syncPresetHighlight();
    updateCalculations();
    updateTimelineDetail(trip);
    showNotification('Loaded "' + trip.title + '" into the Mobility Lab');
  }

  function updateTimelineDetail(trip) {
    var detailEl = document.getElementById('timelineInspectionDetail');
    if (!detailEl) return;
    var modeObj = DATA.emissionFactors[trip.mode];
    detailEl.innerHTML =
      '<div class="timeline-detail-header">' +
      '<span class="k">SAMPLE TRIP DETAILS</span>' +
      '<h4>' + trip.title + '</h4>' +
      '<p>' + trip.route + '</p>' +
      '</div>' +
      '<div class="timeline-detail-metrics">' +
      '<div class="td-metric"><span class="k">DISTANCE</span><b class="v">' + trip.km + ' km</b></div>' +
      '<div class="td-metric"><span class="k">TRANSIT MODE</span><b class="v" style="color:' + modeObj.color + '">' + modeObj.name + '</b></div>' +
      '<div class="td-metric"><span class="k">TIME</span><b class="v">' + trip.time + '</b></div>' +
      '<div class="td-metric"><span class="k">STATUS</span><b class="v">DEMO DATA, not verified</b></div>' +
      '</div>';
  }

  function showChartTooltip(text, x, y) {
    var tip = document.getElementById('chartTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'chartTooltip';
      tip.className = 'chart-tooltip-floating';
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.left = (x + 12) + 'px';
    tip.style.top = (y - 28) + 'px';
    tip.style.opacity = '1';
  }

  function hideChartTooltip() {
    var tip = document.getElementById('chartTooltip');
    if (tip) tip.style.opacity = '0';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.remove('val-updated');
      void el.offsetWidth;
      el.classList.add('val-updated');
    }
  }

  function showNotification(msg) {
    var toastContainer = document.getElementById('toasts');
    if (!toastContainer) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = '⚡ ' + msg;
    toastContainer.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
