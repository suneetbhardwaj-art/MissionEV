/**
 * MissionEV - Portal V3 testnet module (the ONLY place that touches a wallet or the chain).
 *
 * Rules enforced here:
 *  - Demo mode never produces a hash, block, receipt or balance.
 *  - On-chain actions are enabled only after: wallet connected, wallet chain == 420420777,
 *    a contract address configured, and eth_getCode at that address non-empty.
 *  - "Pending" appears only after the wallet has been asked to sign; "confirmed" only after a
 *    mined receipt with status 1. Failures never fall back to a success message.
 *  - No private keys or seed phrases are ever requested or handled.
 * All addresses, ABIs and supported methods come from contract-abi.js.
 */

(function () {
  'use strict';

  var CFG = window.PORTAL_V3_CONFIG;
  var DATA = window.MISSION_EV_DATA;
  var ADDRESS_KEY = 'missionev_contract_address_v1';

  var web3State = {
    mode: 'demo',                 // 'demo' | 'testnet'
    provider: null,               // BrowserProvider (wallet)
    account: null,
    chainId: null,
    isCorrectNetwork: false,
    contractAddress: '',
    readProvider: null,           // JsonRpcProvider on the configured RPC
    deployment: { checked: false },
    nativeGasBalance: null,
    token: null,                  // { symbol, decimals, balance }
    onChainStats: null,
    isPendingTx: false,
    lab: null
  };

  /* ------------------------------------------------------------------ init */

  function init() {
    web3State.contractAddress = loadStoredAddress() || CFG.contractAddress || '';

    if (typeof ethers === 'undefined') {
      setConfigRows([['ethers.js', 'not loaded: on-chain features unavailable', 'bad']]);
      return;
    }
    web3State.readProvider = new ethers.JsonRpcProvider(CFG.rpcUrl, CFG.chainId, { staticNetwork: true });

    setupWalletButtons();
    setupModeToggle();
    setupContractInput();
    setupSubmit();

    document.addEventListener('missionev:lab-updated', function (e) {
      web3State.lab = e.detail;
      if (!web3State.isPendingTx) resetTxCard();
      updateSubmitState();
    });
    if (window.MISSION_EV_LAB) web3State.lab = window.MISSION_EV_LAB.getResult();

    setExecutionMode('demo');
    resetTxCard();
    updateWeb3UI();
    refreshConfigStatus();
  }

  function loadStoredAddress() {
    try {
      var v = localStorage.getItem(ADDRESS_KEY);
      return v && ethers.isAddress(v) ? v : '';
    } catch (e) { return ''; }
  }
  function storeAddress(v) { try { localStorage.setItem(ADDRESS_KEY, v); } catch (e) {} }

  /* ------------------------------------------- live config status (real RPC) */

  async function refreshConfigStatus() {
    var rows = [];
    var d = { checked: true, rpcOk: false, hasCode: false, tokenReady: false };
    var rp = web3State.readProvider;

    try {
      var net = await rp.send('eth_chainId', []);
      var id = parseInt(net, 16);
      d.rpcOk = id === CFG.chainId;
      rows.push(['RPC chain ID', id + (d.rpcOk ? ' (matches configured ' + CFG.chainId + ')' : ' (MISMATCH, configured ' + CFG.chainId + ')'), d.rpcOk ? 'ok' : 'bad']);
      var blk = await rp.getBlockNumber();
      rows.push(['Latest block (read from RPC now)', '#' + blk.toLocaleString(), 'ok']);
    } catch (e) {
      rows.push(['RPC', 'unreachable: ' + (e.shortMessage || e.message), 'bad']);
    }

    if (!web3State.contractAddress) {
      rows.push(['Contract address', 'NOT CONFIGURED. Paste a deployed EVMobilityRewards address below.', 'warn']);
    } else if (d.rpcOk) {
      rows.push(['Contract address', web3State.contractAddress, 'ok']);
      try {
        var code = await rp.getCode(web3State.contractAddress);
        d.hasCode = code && code !== '0x';
        rows.push(['Bytecode at address', d.hasCode ? 'present (' + Math.round((code.length - 2) / 2) + ' bytes)' : 'NONE: no contract is deployed here', d.hasCode ? 'ok' : 'bad']);
      } catch (e) {
        rows.push(['Bytecode at address', 'check failed: ' + (e.shortMessage || e.message), 'bad']);
      }
    }

    if (d.hasCode) {
      try {
        var c = new ethers.Contract(web3State.contractAddress, window.EV_MOBILITY_REWARDS_ABI, rp);
        var tokenAddr = await c.portalToken();
        if (tokenAddr === ethers.ZeroAddress) {
          rows.push(['Reward token', 'not set on the contract: journeys are recorded but no tokens can be paid', 'warn']);
        } else {
          var t = new ethers.Contract(tokenAddr, window.PORTAL_TOKEN_ABI, rp);
          var sym = await t.symbol();
          var dec = Number(await t.decimals());
          var bal = await t.balanceOf(web3State.contractAddress);
          d.token = { address: tokenAddr, symbol: sym, decimals: dec, contractBalance: bal };
          d.tokenReady = true;
          rows.push(['Reward token', sym + ' at ' + tokenAddr, 'ok']);
          rows.push(['Contract token balance', ethers.formatUnits(bal, dec) + ' ' + sym + (bal === 0n ? ' (unfunded: rewards will NOT be paid)' : ''), bal === 0n ? 'warn' : 'ok']);
        }
      } catch (e) {
        rows.push(['Contract interface', 'does not look like EVMobilityRewards: ' + (e.shortMessage || e.message), 'bad']);
        d.hasCode = false;
      }
    }

    web3State.deployment = d;
    setConfigRows(rows);
    updateWeb3UI();
    refreshWalletData();
    updateSubmitState();
  }

  function setConfigRows(rows) {
    var box = document.getElementById('web3ConfigStatus');
    if (!box) return;
    box.textContent = '';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'cfg-row cfg-' + r[2];
      var k = document.createElement('span'); k.className = 'cfg-k'; k.textContent = r[0];
      var v = document.createElement('span'); v.className = 'cfg-v mono'; v.textContent = r[1];
      row.appendChild(k); row.appendChild(v);
      box.appendChild(row);
    });
  }

  /* ------------------------------------------------------------ UI wiring */

  function setupWalletButtons() {
    document.querySelectorAll('.wallet-connect-trigger, #walletConnectBtn').forEach(function (btn) {
      btn.addEventListener('click', toggleWalletConnection);
    });
    var sw = document.getElementById('switchNetworkBtn');
    if (sw) sw.addEventListener('click', switchOrAddPortalNetwork);

    if (window.ethereum && window.ethereum.on) {
      window.ethereum.on('accountsChanged', onAccountsChanged);
      window.ethereum.on('chainChanged', onChainChanged);
    }
  }

  function setupModeToggle() {
    var d = document.getElementById('web3ModeDemoBtn');
    var t = document.getElementById('web3ModeTestnetBtn');
    if (d) d.addEventListener('click', function () { setExecutionMode('demo'); });
    if (t) t.addEventListener('click', function () { setExecutionMode('testnet'); });
  }

  function setExecutionMode(mode) {
    web3State.mode = mode;
    var d = document.getElementById('web3ModeDemoBtn');
    var t = document.getElementById('web3ModeTestnetBtn');
    if (d) { d.classList.toggle('active', mode === 'demo'); d.setAttribute('aria-pressed', mode === 'demo'); }
    if (t) { t.classList.toggle('active', mode === 'testnet'); t.setAttribute('aria-pressed', mode === 'testnet'); }

    document.querySelectorAll('.web3-demo-indicator').forEach(function (el) { el.style.display = mode === 'demo' ? '' : 'none'; });
    document.querySelectorAll('.web3-testnet-indicator').forEach(function (el) { el.style.display = mode === 'testnet' ? '' : 'none'; });
    document.querySelectorAll('.web3-onchain-control').forEach(function (el) { el.style.display = mode === 'testnet' ? '' : 'none'; });

    var banner = document.getElementById('web3ModeBanner');
    if (banner) {
      banner.textContent = '';
      var b = document.createElement('b');
      if (mode === 'testnet') {
        banner.className = 'web3-mode-banner testnet-active';
        b.textContent = 'PORTAL V3 TESTNET MODE: ';
        banner.appendChild(b);
        banner.appendChild(document.createTextNode('actions here create real transactions on chain ' + CFG.chainId + ' and need a connected wallet, testnet gas and a verified contract. Availability is shown below.'));
      } else {
        banner.className = 'web3-mode-banner demo-active';
        b.textContent = 'DEMO MODE: ';
        banner.appendChild(b);
        banner.appendChild(document.createTextNode('emissions are calculated locally with sample data. No wallet, gas or contract is used and nothing is sent to a blockchain.'));
      }
    }
    resetTxCard();
    updateSubmitState();
  }

  function setupContractInput() {
    var input = document.getElementById('customContractAddressInput');
    var btn = document.getElementById('saveContractAddressesBtn');
    if (input) input.value = web3State.contractAddress;
    if (btn) {
      btn.addEventListener('click', function () {
        var v = input ? input.value.trim() : '';
        if (v === '') {
          web3State.contractAddress = '';
          try { localStorage.removeItem(ADDRESS_KEY); } catch (e) {}
        } else if (ethers.isAddress(v)) {
          web3State.contractAddress = ethers.getAddress(v);
          storeAddress(web3State.contractAddress);
        } else {
          toast('That is not a valid EVM address.');
          return;
        }
        web3State.onChainStats = null;
        web3State.token = null;
        refreshConfigStatus();
      });
    }
  }

  /* --------------------------------------------------------------- wallet */

  async function toggleWalletConnection() {
    if (!web3State.account) await connectWallet();
    else disconnectWallet();
  }

  async function connectWallet() {
    if (!window.ethereum) {
      toast('No browser wallet detected. Install MetaMask or a compatible wallet to use testnet mode. Demo mode still works.');
      return;
    }
    try {
      var bp = new ethers.BrowserProvider(window.ethereum);
      var accounts = await bp.send('eth_requestAccounts', []);
      if (!accounts || !accounts.length) return;
      web3State.provider = bp;
      web3State.account = ethers.getAddress(accounts[0]);
      await readWalletChain();
      setExecutionMode('testnet');
      if (!web3State.isCorrectNetwork) await switchOrAddPortalNetwork();
      await refreshWalletData();
      updateWeb3UI();
      updateSubmitState();
    } catch (err) {
      toast(err && (err.code === 4001 || err.code === 'ACTION_REJECTED') ? 'Wallet connection was rejected.' : 'Wallet connection failed: ' + describeError(err));
    }
  }

  async function readWalletChain() {
    var net = await web3State.provider.getNetwork();
    web3State.chainId = Number(net.chainId);
    web3State.isCorrectNetwork = web3State.chainId === CFG.chainId;
  }

  function disconnectWallet() {
    web3State.provider = null;
    web3State.account = null;
    web3State.chainId = null;
    web3State.isCorrectNetwork = false;
    web3State.nativeGasBalance = null;
    web3State.token = null;
    web3State.onChainStats = null;
    setExecutionMode('demo');
    updateWeb3UI();
    toast('Wallet disconnected from this page. Back to demo mode.');
  }

  async function switchOrAddPortalNetwork() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CFG.chainIdHex }] });
    } catch (switchError) {
      if (switchError && (switchError.code === 4902 || /4902|Unrecognized chain/i.test(switchError.message || ''))) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CFG.chainIdHex,
              chainName: CFG.chainName,
              rpcUrls: [CFG.rpcUrl],
              nativeCurrency: CFG.nativeCurrency,
              blockExplorerUrls: [CFG.blockExplorerUrl]
            }]
          });
        } catch (addError) {
          toast('Could not add the Portal V3 network: ' + describeError(addError));
          return;
        }
      } else {
        toast('Network switch was cancelled or failed.');
        return;
      }
    }
    if (web3State.provider) {
      web3State.provider = new ethers.BrowserProvider(window.ethereum);   // network changed: rebuild
      await readWalletChain();
      await refreshWalletData();
      updateWeb3UI();
      updateSubmitState();
    }
  }

  async function onAccountsChanged(accounts) {
    if (!accounts || !accounts.length) { disconnectWallet(); return; }
    web3State.account = ethers.getAddress(accounts[0]);
    web3State.onChainStats = null;
    web3State.token = null;
    resetTxCard();
    await refreshWalletData();
    updateWeb3UI();
    updateSubmitState();
  }

  async function onChainChanged() {
    if (!web3State.account) return;
    web3State.provider = new ethers.BrowserProvider(window.ethereum);
    await readWalletChain();
    await refreshWalletData();
    updateWeb3UI();
    updateSubmitState();
  }

  /** Reads balances and contract state for the connected account. Values stay null if a read fails. */
  async function refreshWalletData() {
    if (!web3State.account) return;
    var rp = web3State.readProvider;
    try {
      var wei = await rp.getBalance(web3State.account);
      web3State.nativeGasBalance = Number(ethers.formatEther(wei)).toFixed(4);
    } catch (e) { web3State.nativeGasBalance = null; }

    var d = web3State.deployment;
    if (d && d.hasCode) {
      try {
        var c = new ethers.Contract(web3State.contractAddress, window.EV_MOBILITY_REWARDS_ABI, rp);
        var s = await c.getCommuter(web3State.account);
        web3State.onChainStats = {
          score: Number(s.score), streakDays: Number(s.streakDays),
          totalAvoidedGrams: Number(s.totalAvoidedGrams), totalEmittedGrams: Number(s.totalEmittedGrams),
          totalTrips: Number(s.totalTrips)
        };
        if (d.tokenReady) {
          web3State.token = { symbol: d.token.symbol, decimals: d.token.decimals, balance: ethers.formatUnits(s.tokenBalance, d.token.decimals) };
        }
      } catch (e) {
        web3State.onChainStats = null;
      }
    }
    updateWeb3UI();
  }

  /* ------------------------------------------------------------ UI render */

  function updateWeb3UI() {
    var walletBtn = document.getElementById('walletConnectBtn');
    if (walletBtn) {
      var dot = document.createElement('span');
      dot.className = 'wallet-dot' + (web3State.account && web3State.isCorrectNetwork ? ' online' : '');
      var label = document.createElement('span');
      label.className = 'wallet-btn-text';
      label.textContent = web3State.account
        ? shorten(web3State.account) + (web3State.isCorrectNetwork ? ' · PORTAL V3' : ' · WRONG NETWORK')
        : 'Connect Testnet Wallet';
      walletBtn.textContent = '';
      walletBtn.appendChild(dot);
      walletBtn.appendChild(document.createTextNode(' '));
      walletBtn.appendChild(label);
      walletBtn.classList.toggle('connected', !!web3State.account);
    }

    var banner = document.getElementById('networkMismatchBanner');
    if (banner) {
      var show = !!web3State.account && !web3State.isCorrectNetwork;
      banner.style.display = show ? '' : 'none';
      setText('currentDetectedChain', show ? 'Detected chain ID: ' + (web3State.chainId || 'unknown') : '');
    }

    var sym = web3State.token ? web3State.token.symbol : 'token';
    setText('web3ConnectedAccount', web3State.account || 'Not connected');
    setText('web3NativeGasBal', web3State.nativeGasBalance != null ? web3State.nativeGasBalance + ' ' + CFG.nativeCurrency.symbol : '—');
    setText('web3TokenLabel', web3State.token ? 'REWARD TOKEN BALANCE (' + sym + ')' : 'REWARD TOKEN BALANCE');
    setText('web3TokenBal', web3State.token ? Number(web3State.token.balance).toFixed(2) + ' ' + sym : '—');
    setText('web3TargetContract', web3State.contractAddress ? shorten(web3State.contractAddress) : 'not configured');

    var s = web3State.onChainStats;
    setText('onChainCarbonScore', s ? String(s.score) : '—');
    setText('onChainStreak', s ? s.streakDays + ' days' : '—');
    setText('onChainTotalTrips', s ? String(s.totalTrips) : '—');
    setText('onChainTotalAvoided', s ? (s.totalAvoidedGrams / 1000).toFixed(2) + ' kg' : '—');
  }

  /* ----------------------------------------------- submit button state */

  /** Single source of truth for whether (and why not) a real transaction can be sent. */
  function computeSubmitState() {
    var lab = web3State.lab;
    var d = web3State.deployment;
    if (!lab) return { enabled: false, label: 'Waiting for Mobility Lab…', reason: '' };

    var pre = DATA.onChainPreview(lab.mode.id, lab.distanceKm);
    if (!pre.supported) {
      return { enabled: false, label: 'No on-chain method for this journey type', reason: '"' + lab.mode.name + '" has no method in EVMobilityRewards.sol. It stays demo-only. On-chain types: Electric Car, Petrol Car, Diesel SUV.' };
    }
    if (!web3State.contractAddress) {
      return { enabled: false, label: 'Contract address not configured', reason: 'Paste a deployed EVMobilityRewards address in the config panel below.' };
    }
    if (!d || !d.checked) return { enabled: false, label: 'Checking contract…', reason: '' };
    if (!d.rpcOk) return { enabled: false, label: 'RPC check failed', reason: 'Could not verify chain ' + CFG.chainId + ' on ' + CFG.rpcUrl + '.' };
    if (!d.hasCode) return { enabled: false, label: 'No contract deployed at this address', reason: 'eth_getCode returned no bytecode (or the contract does not match the expected interface).' };
    if (!pre.validDistance) return { enabled: false, label: 'Distance outside 1–500 km', reason: '' };
    if (!web3State.account) return { enabled: true, action: 'connect', label: 'Connect wallet to continue', reason: '' };
    if (!web3State.isCorrectNetwork) return { enabled: true, action: 'switch', label: 'Switch wallet to Portal V3 (' + CFG.chainId + ')', reason: '' };

    var extra = '';
    if (pre.method === 'recordEVJourney') {
      var funded = d.tokenReady && d.token.contractBalance >= BigInt(Math.round(pre.tokenRewardIfFunded * 100)) * (10n ** BigInt(Math.max(0, d.token.decimals - 2)));
      extra = funded
        ? 'Reward of ' + pre.tokenRewardIfFunded + ' ' + d.token.symbol + ' is expected to be paid (contract balance covers it).'
        : 'The contract will record this journey but is NOT expected to pay tokens (no token set, or its balance is too low).';
    } else {
      extra = 'This records emissions and lowers the on-chain score by 5. It does not burn or transfer tokens.';
    }
    var rounded = lab.distanceKm !== pre.distanceKm ? ' Distance is rounded to ' + pre.distanceKm + ' km for the contract (it accepts whole km).' : '';
    return { enabled: true, action: 'submit', label: 'Submit ' + (pre.method === 'recordEVJourney' ? 'EV' : 'fossil') + ' journey to Portal V3 (wallet will ask to confirm)', reason: extra + rounded };
  }

  function updateSubmitState() {
    var btn = document.getElementById('submitRealOnChainBtn');
    var note = document.getElementById('onchainPreflightNote');
    var st = computeSubmitState();
    if (btn) {
      btn.disabled = !st.enabled || web3State.isPendingTx;
      if (!web3State.isPendingTx) btn.textContent = st.label;
    }
    if (note) note.textContent = st.reason || '';
  }

  /* ------------------------------------------------------- transaction */

  function setupSubmit() {
    var btn = document.getElementById('submitRealOnChainBtn');
    if (btn) btn.addEventListener('click', handleSubmit);
  }

  async function handleSubmit() {
    if (web3State.isPendingTx) return;
    var st = computeSubmitState();
    if (!st.enabled) return;
    if (st.action === 'connect') { await connectWallet(); return; }
    if (st.action === 'switch') { await switchOrAddPortalNetwork(); return; }

    var lab = web3State.lab;
    var pre = DATA.onChainPreview(lab.mode.id, lab.distanceKm);
    var support = window.ONCHAIN_SUPPORTED_MODES[lab.mode.id];
    var btn = document.getElementById('submitRealOnChainBtn');

    web3State.isPendingTx = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Waiting for wallet approval…'; }
    var txHash = null;

    try {
      // Re-verify right before sending: wallet chain and contract bytecode.
      var bp = new ethers.BrowserProvider(window.ethereum);
      var net = await bp.getNetwork();
      if (Number(net.chainId) !== CFG.chainId) throw new Error('Wallet is on chain ' + net.chainId + ', expected ' + CFG.chainId + '.');
      var code = await bp.getCode(web3State.contractAddress);
      if (!code || code === '0x') throw new Error('No contract bytecode at ' + web3State.contractAddress + ' on this network.');
      if (!pre.validDistance) throw new Error('Distance must be a whole number from 1 to 500 km.');

      var signer = await bp.getSigner();
      if (ethers.getAddress(await signer.getAddress()) !== web3State.account) throw new Error('Wallet account changed. Reconnect and try again.');
      var contract = new ethers.Contract(web3State.contractAddress, window.EV_MOBILITY_REWARDS_ABI, signer);
      var journeyId = ethers.hexlify(ethers.randomBytes(32));

      showTx({ state: 'wallet', text: 'Waiting for you to approve the transaction in your wallet…' });

      var tx = support.method === 'recordEVJourney'
        ? await contract.recordEVJourney(journeyId, pre.distanceKm)
        : await contract.recordICEJourney(journeyId, support.vehicleType, pre.distanceKm, 0);

      txHash = tx.hash;
      showTx({ state: 'pending', text: 'Transaction sent. Waiting for it to be mined…', hash: txHash });

      var receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw Object.assign(new Error('Transaction was mined but reverted.'), { receipt: receipt });

      var outcome = parseOutcome(contract, receipt);
      showTx({ state: 'confirmed', text: 'Confirmed on chain.', hash: txHash, receipt: receipt, outcome: outcome });
      await refreshWalletData();
    } catch (err) {
      var rejected = err && (err.code === 'ACTION_REJECTED' || err.code === 4001);
      if (rejected) {
        showTx({ state: 'rejected', text: 'You rejected the request in your wallet. Nothing was sent.' });
      } else {
        showTx({ state: 'failed', text: 'Transaction failed: ' + describeError(err), hash: txHash });
      }
    } finally {
      web3State.isPendingTx = false;
      updateSubmitState();
    }
  }

  function parseOutcome(contract, receipt) {
    var out = { journey: null, rewardPaid: null };
    receipt.logs.forEach(function (log) {
      try {
        var p = contract.interface.parseLog(log);
        if (!p) return;
        if (p.name === 'JourneyLogged') out.journey = { co2Grams: Number(p.args.co2Grams), isReward: p.args.isReward, tokenReward: p.args.tokenReward };
        if (p.name === 'RewardClaimed') out.rewardPaid = p.args.amount;
      } catch (e) { /* log from another contract */ }
    });
    return out;
  }

  function resetTxCard() {
    if (web3State.isPendingTx) return;
    showTx({ state: 'none', text: 'No transaction submitted' });
  }

  /** Renders the real-transaction card with DOM nodes (no HTML injection from error text). */
  function showTx(info) {
    var card = document.getElementById('realTxReceiptCard');
    var msg = document.getElementById('realTxStatusMessage');
    if (!card || !msg) return;
    card.style.display = 'block';
    card.setAttribute('data-state', info.state);
    msg.textContent = '';

    var line = document.createElement('div');
    line.className = 'tx-line tx-' + info.state;
    line.textContent = (info.state === 'confirmed' ? '✅ ' : info.state === 'failed' ? '❌ ' : '') + info.text;
    msg.appendChild(line);

    if (info.hash) {
      var h = document.createElement('div');
      h.appendChild(document.createTextNode('Tx hash: '));
      var code = document.createElement('code'); code.className = 'mono hl'; code.textContent = info.hash;
      h.appendChild(code);
      msg.appendChild(h);
      var a = document.createElement('a');
      a.href = CFG.blockExplorerUrl + '/tx/' + info.hash;
      a.target = '_blank'; a.rel = 'noopener'; a.className = 'hl';
      a.textContent = 'Open in explorer (configured URL, availability not guaranteed)';
      msg.appendChild(a);
    }
    if (info.receipt) {
      var r = document.createElement('div');
      r.textContent = 'Block #' + info.receipt.blockNumber + ' · gas used ' + info.receipt.gasUsed.toString();
      msg.appendChild(r);
    }
    if (info.outcome) {
      var o = document.createElement('div');
      var parts = [];
      if (info.outcome.journey) {
        parts.push((info.outcome.journey.isReward ? 'Avoided ' : 'Emitted ') + info.outcome.journey.co2Grams + ' g CO2 recorded (contract constants).');
      }
      var d = web3State.deployment;
      if (info.outcome.rewardPaid != null && d && d.token) {
        parts.push('Reward paid: ' + ethers.formatUnits(info.outcome.rewardPaid, d.token.decimals) + ' ' + d.token.symbol + '.');
      } else if (info.outcome.journey && info.outcome.journey.isReward) {
        parts.push('No tokens were transferred (contract unfunded or no token set).');
      }
      o.textContent = parts.join(' ');
      msg.appendChild(o);
    }
  }

  /* ------------------------------------------------------------- helpers */

  function describeError(err) {
    if (!err) return 'unknown error';
    var inner = (err.error && err.error.message) || (err.info && err.info.error && err.info.error.message);
    var m = err.reason || inner || err.shortMessage || err.message || String(err);
    return String(m).replace(/^execution reverted:\s*/i, 'reverted: ').slice(0, 220);
  }

  function shorten(addr) {
    return addr && addr.length > 10 ? addr.substring(0, 6) + '…' + addr.substring(addr.length - 4) : (addr || '');
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function toast(msg) {
    var c = document.getElementById('toasts');
    if (!c) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = '⚡ ' + msg;
    c.appendChild(t);
    setTimeout(function () { t.remove(); }, 4500);
  }

  window.MISSION_EV_WEB3 = {
    state: web3State,
    connectWallet: connectWallet,
    disconnectWallet: disconnectWallet,
    refreshConfigStatus: refreshConfigStatus,
    computeSubmitState: computeSubmitState
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
