/**
 * MissionEV - Chapters 05 & 06: pipeline explainer, SIMULATED transaction walkthrough, architecture status.
 *
 * Nothing in this file talks to a blockchain or to Azure. The simulation produces NO transaction
 * hash, NO block number and NO gas receipt, because nothing is submitted. Wallet connection and real
 * transactions live in web3-portal.js.
 */

(function () {
  'use strict';

  var DATA = window.MISSION_EV_DATA;
  var simState = 'idle'; // 'idle' | 'running' | 'done'
  var timers = [];
  var lastLab = null;

  function init() {
    setupPipelineInteractions();
    setupTxSimulator();
    setupArchitectureExplorer();
    document.addEventListener('missionev:lab-updated', function (e) {
      lastLab = e.detail;
      updateTxPreview();
      if (simState === 'done') resetSimulation();   // stale result must not outlive new inputs
    });
    if (window.MISSION_EV_LAB && window.MISSION_EV_LAB.getResult()) lastLab = window.MISSION_EV_LAB.getResult();
    updateTxPreview();
  }

  /* ---------- Chapter 05: pipeline explainer ---------- */
  var pipelineDetails = {
    step1: {
      title: '01 / JOURNEY INPUT',
      subtitle: 'The commuter reports a trip',
      body: 'In EVMobilityRewards.sol the caller passes the distance themselves (1 to 500 km). Nothing in the contract verifies it: there is no GPS proof, telemetry or oracle check. Telemetry capture (OBD-II, Azure IoT) is a planned idea, not an implemented feature.',
      badge: 'IMPLEMENTED ON-CHAIN: SELF-REPORTED'
    },
    step2: {
      title: '02 / EMISSIONS ORACLE',
      subtitle: 'Planned Azure Functions oracle (not built)',
      body: 'The design calls for an Azure Functions service that computes emissions and signs the result (see MissionEV.sol, which verifies an EIP-712 oracle signature). No such service exists in this project and the deployed-style contract does not call it. In this prototype the emissions maths runs in your browser.',
      badge: 'PLANNED · NOT CONNECTED'
    },
    step3: {
      title: '03 / SMART CONTRACT RULES',
      subtitle: 'EVMobilityRewards.sol, as written in this repo',
      body: 'recordEVJourney: rejects duplicates of the same journeyId, credits (196 − 68) g/km of "avoided" CO2 using fixed constants, raises the stored score by 8 and sends 1.5 reward tokens per km travelled only if the contract already holds enough of the token. recordICEJourney: records emitted grams, lowers the score by 5 and resets the streak. It never burns or transfers tokens as a penalty, and the contract never mints.',
      badge: 'SOURCE IN REPO · SEE CONFIG STATUS FOR DEPLOYMENT'
    },
    step4: {
      title: '04 / STATE CHANGE',
      subtitle: 'What is stored on-chain',
      body: 'Per commuter: score (starts at 500), streak, last trip time, total avoided grams, total emitted grams, trip count and tokens received. There are no badges or NFTs in the contract. A streak counts consecutive journeys no more than 36 hours apart, and an ICE journey resets it.',
      badge: 'IMPLEMENTED IN CONTRACT SOURCE'
    },
    step5: {
      title: '05 / PUBLIC RECORD',
      subtitle: 'Events and explorer',
      body: 'A confirmed transaction emits JourneyLogged (and RewardClaimed when tokens move) and is visible on the block explorer. Journeys are stored per wallet address, so they are publicly linkable to that address. No privacy or zero-knowledge features exist.',
      badge: 'AFTER A REAL TRANSACTION ONLY'
    }
  };

  function setupPipelineInteractions() {
    var steps = document.querySelectorAll('.pipeline-step-node');
    steps.forEach(function (step) {
      var activate = function () {
        steps.forEach(function (s) { s.classList.remove('active'); s.setAttribute('aria-pressed', 'false'); });
        step.classList.add('active');
        step.setAttribute('aria-pressed', 'true');
        showPipelineDetail(step.getAttribute('data-step'));
      };
      step.addEventListener('click', activate);
    });
    showPipelineDetail('step3');
  }

  function showPipelineDetail(key) {
    var info = pipelineDetails[key];
    if (!info) return;
    setText('pipelineDetailTitle', info.title);
    setText('pipelineDetailSub', info.subtitle);
    setText('pipelineDetailBody', info.body);
    setText('pipelineDetailBadge', info.badge);
  }

  /* ---------- Chapter 05: simulated transaction walkthrough ---------- */
  function setupTxSimulator() {
    var btn = document.getElementById('simulateTxBtn');
    if (btn) btn.addEventListener('click', startTransactionSimulation);
    resetSimulation();
  }

  function updateTxPreview() {
    var res = lastLab;
    if (!res) return;
    var pre = DATA.onChainPreview(res.mode.id, res.distanceKm);

    setText('txPreviewMode', res.mode.name);
    setText('txPreviewDist', DATA.fmtKg(res.distanceKm, 1) + ' km');
    setText('txPreviewAvoided', DATA.fmtSignedKg(res.avoidedKg) + ' kg (lab model)');

    var code;
    if (!pre.supported) {
      code = '// No on-chain method exists for "' + res.mode.name + '".\n' +
        '// EVMobilityRewards.sol only records EV-car, petrol and diesel journeys.\n' +
        '// This journey type is DEMO-ONLY and cannot be submitted.';
    } else if (pre.method === 'recordEVJourney') {
      code = 'EVMobilityRewards.recordEVJourney(\n' +
        '  bytes32 journeyId = <random 32 bytes, generated at submit>,\n' +
        '  uint32  distanceKm = ' + pre.distanceKm + '\n' +
        ');\n' +
        '// contract would record: ' + pre.avoidedGrams + ' g avoided (fixed 196 − 68 g/km), score +8,\n' +
        '// reward ' + pre.tokenRewardIfFunded + ' tokens ONLY if the contract holds enough token balance';
    } else {
      var vt = window.ONCHAIN_SUPPORTED_MODES[res.mode.id].vehicleType;
      code = 'EVMobilityRewards.recordICEJourney(\n' +
        '  bytes32 journeyId = <random 32 bytes, generated at submit>,\n' +
        '  uint8   vehicleType = ' + vt + ',\n' +
        '  uint32  distanceKm = ' + pre.distanceKm + ',\n' +
        '  uint32  customMileageKmPerLitre = 0\n' +
        ');\n' +
        '// contract would record: ' + pre.emittedGrams + ' g emitted, score −5, streak reset.\n' +
        '// No tokens are burned or transferred.';
    }
    var codeEl = document.getElementById('txSolidityCall');
    if (codeEl) codeEl.textContent = code;
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function resetSimulation() {
    clearTimers();
    simState = 'idle';
    var btn = document.getElementById('simulateTxBtn');
    var card = document.getElementById('txStatusCard');
    if (btn) { btn.disabled = false; btn.textContent = 'Run Simulation (nothing is submitted)'; }
    if (card) card.className = 'tx-status-card';
    setText('txStateLabel', 'No transaction submitted');
    var bar = document.getElementById('txProgressBar');
    if (bar) bar.style.width = '0%';
    setText('txReceiptHash', 'none: nothing was submitted');
    setText('txReceiptBlock', 'none');
    setText('txReceiptGas', 'none');
    setText('txReceiptEvent', 'none');
  }

  function startTransactionSimulation() {
    if (simState === 'running') return;
    var btn = document.getElementById('simulateTxBtn');
    var card = document.getElementById('txStatusCard');
    var bar = document.getElementById('txProgressBar');
    if (!btn || !card) return;

    simState = 'running';
    btn.disabled = true;
    card.className = 'tx-status-card running';

    var stages = [
      ['SIMULATION 1/3: computing the journey locally…', '33%'],
      ['SIMULATION 2/3: pretending to ask a wallet to sign…', '66%'],
      ['SIMULATION 3/3: pretending to broadcast…', '90%']
    ];
    stages.forEach(function (st, i) {
      timers.push(setTimeout(function () {
        setText('txStateLabel', st[0]);
        if (bar) bar.style.width = st[1];
      }, i * 800));
    });

    timers.push(setTimeout(function () {
      simState = 'done';
      card.className = 'tx-status-card success';
      if (bar) bar.style.width = '100%';
      var res = lastLab;
      setText('txStateLabel', 'SIMULATED TRANSACTION · NOT SUBMITTED TO BLOCKCHAIN');
      setText('txReceiptHash', 'none: nothing was submitted');
      setText('txReceiptBlock', 'none');
      setText('txReceiptGas', 'none');
      setText('txReceiptEvent', res ? 'Would reward ' + res.rewardPoints + ' demo points (illustrative rule, not the contract rule)' : 'none');
      btn.disabled = false;
      btn.textContent = 'Run Simulation Again';
    }, stages.length * 800 + 400));
  }

  /* ---------- Chapter 06: architecture with honest status ---------- */
  var architectureSpecs = {
    layer1: {
      name: 'LAYER 1: CLIENT FRONTEND',
      role: 'Static responsive web app: Mobility Lab, sample dashboard, wallet connector',
      synergy: 'Plain HTML, CSS and JavaScript served as static files. Emissions maths runs in the browser. It is not a PWA: there is no service worker or offline trip queue.',
      techStack: 'HTML, CSS, vanilla JS, ethers.js v6 (bundled).',
      status: 'IMPLEMENTED'
    },
    layer2: {
      name: 'LAYER 2: MICROSOFT AZURE (PLANNED)',
      role: 'Intended: emissions oracle, route verification, telemetry streaming',
      synergy: 'Azure Functions, Azure Maps and Event Hubs are design targets only. None is implemented, configured or called by this project, and there is no live health status to show.',
      techStack: 'Planned: Azure Functions, Azure Maps, Event Hubs, API Management, Key Vault.',
      status: 'PLANNED · NOT IMPLEMENTED'
    },
    layer3: {
      name: 'LAYER 3: PORTAL V3 EVM CONTRACT',
      role: 'EVMobilityRewards.sol: journey records, score, streak, optional token rewards',
      synergy: 'Contract source and ABI are in the repo and the network config was checked against the RPC. Whether a contract is deployed at a given address is checked live in the "Config status" panel in chapter 05; the addresses previously in the README had no code. MissionEV.sol (oracle-signed design with its own token) is an unused alternative.',
      techStack: 'Solidity 0.8.24, ethers.js v6. No ERC-721 badges exist.',
      status: 'SOURCE ONLY · DEPLOYMENT NOT VERIFIED'
    },
    layer4: {
      name: 'LAYER 4: STORAGE & ANALYTICS (PLANNED)',
      role: 'Intended: per-user storage and city-level dashboards',
      synergy: 'Cosmos DB, Microsoft Fabric and Power BI are not used. The "city" figures on this site come from a simple browser-side model with illustrative inputs, not from any dataset.',
      techStack: 'Planned: Azure Cosmos DB, Microsoft Fabric, Power BI.',
      status: 'PLANNED · NOT IMPLEMENTED'
    }
  };

  function setupArchitectureExplorer() {
    var layers = document.querySelectorAll('.arch-layer-card');
    layers.forEach(function (card) {
      var activate = function () {
        layers.forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        card.classList.add('active');
        card.setAttribute('aria-pressed', 'true');
        displayArchitectureSpec(card.getAttribute('data-layer'));
        pulseArchitectureDataPath();
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });
    displayArchitectureSpec('layer2');
  }

  function displayArchitectureSpec(key) {
    var spec = architectureSpecs[key];
    if (!spec) return;
    setText('archSpecName', spec.name);
    setText('archSpecRole', spec.role);
    setText('archSpecSynergy', spec.synergy);
    setText('archSpecTech', spec.techStack);
    setText('archSpecStatus', spec.status);
  }

  function pulseArchitectureDataPath() {
    document.querySelectorAll('.arch-bus-connector').forEach(function (line) {
      line.classList.remove('pulsing');
      void line.offsetWidth;
      line.classList.add('pulsing');
    });
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
