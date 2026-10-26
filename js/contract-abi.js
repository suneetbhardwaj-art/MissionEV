/**
 * MissionEV — single configuration module for the Portal V3 testnet integration.
 *
 * Everything that describes the chain, the contract, its ABI and what the contract can
 * actually do lives here. No other file hard-codes an address, a chain ID or a method name.
 *
 * Verified against the live RPC on 2026-10-26 (eth_chainId -> 0x190f1ca9 = 420420777).
 *
 * IMPORTANT — deployment status:
 *   The addresses that used to be hard-coded here (and in the README) had NO bytecode on the
 *   Portal V3 testnet (eth_getCode returned "0x"). They were removed. Until a real
 *   EVMobilityRewards deployment address is supplied (below, or pasted into the UI), on-chain
 *   actions stay disabled and the app runs in demo mode.
 */

const PORTAL_V3_CONFIG = {
  chainId: 420420777,
  // Derived, never typed by hand (the previous hard-coded hex 0x190f0b49 was wrong).
  chainIdHex: '0x' + (420420777).toString(16),
  chainName: 'Portal V3 Testnet',
  rpcUrl: 'https://test-evm-rpc-v3.portaldot.dev',
  wsUrl: 'wss://test-node-v3.portaldot.dev',
  blockExplorerUrl: 'https://test-explorer-v3.portaldot.dev',
  nativeCurrency: { name: 'Portal Testnet Gas', symbol: 'PORTAL', decimals: 18 },

  // Fill these in with a real deployment. Empty string = not configured.
  contractAddress: '',
  // Optional: the reward token is read from contract.portalToken(); this is only a display fallback.
  tokenAddress: ''
};

/**
 * Human-readable ABI. Checked line-by-line against contract/EVMobilityRewards.sol.
 * VehicleType is an enum, which the ABI encodes as uint8.
 */
const EV_MOBILITY_REWARDS_ABI = [
  'function recordEVJourney(bytes32 journeyId, uint32 distanceKm) external',
  'function recordICEJourney(bytes32 journeyId, uint8 vehicleType, uint32 distanceKm, uint32 customMileageKmPerLitre) external',
  'function getCommuter(address commuter) external view returns (uint256 score, uint256 streakDays, uint256 lastTripTimestamp, uint256 totalAvoidedGrams, uint256 totalEmittedGrams, uint256 totalTrips, uint256 rewardsClaimed, uint256 tokenBalance)',
  'function getUserJourneyCount(address commuter) external view returns (uint256)',
  'function processedJourneys(bytes32) external view returns (bool)',
  'function owner() external view returns (address)',
  'function oracle() external view returns (address)',
  'function portalToken() external view returns (address)',
  'event JourneyLogged(bytes32 indexed journeyId, address indexed commuter, uint8 vehicleType, uint32 distanceKm, uint32 customMileage, uint32 co2Grams, bool isReward, uint256 tokenReward)',
  'event RewardClaimed(address indexed commuter, uint256 amount)',
  'event ScoreAdjusted(address indexed commuter, uint256 oldScore, uint256 newScore)'
];

const PORTAL_TOKEN_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function balanceOf(address account) external view returns (uint256)'
];

/** VehicleType enum order in EVMobilityRewards.sol */
const VEHICLE_TYPE = { EV: 0, E20_ETHANOL: 1, PETROL_REGULAR: 2, PETROL_SPORTS: 3, DIESEL_SUV: 4 };

/**
 * Which lab journey types the deployed contract can really record.
 * Anything not listed here has NO on-chain method and stays demo-only.
 *   - ev_2w is deliberately absent: recordEVJourney credits every EV trip against the
 *     car baseline (196 − 68 g/km), which would over-credit a scooter.
 *   - metro / ebus / active: the contract has no such journey type.
 */
const ONCHAIN_SUPPORTED_MODES = {
  ev_car:     { method: 'recordEVJourney',  vehicleType: VEHICLE_TYPE.EV },
  petrol_car: { method: 'recordICEJourney', vehicleType: VEHICLE_TYPE.PETROL_REGULAR },
  diesel_car: { method: 'recordICEJourney', vehicleType: VEHICLE_TYPE.DIESEL_SUV }
};

/**
 * What the contract source ACTUALLY does (mirrors the Solidity constants and branches).
 * Used only to preview on-chain results; the lab's own model is separate (see data.js).
 */
const ONCHAIN_RULES = {
  minDistanceKm: 1,
  maxDistanceKm: 500,           // require(distanceKm <= 500)
  baselineIceGramsPerKm: 196,   // BASELINE_ICE_GRAMS_KM
  evGridGramsPerKm: 68,         // EV_GRID_GRAMS_KM (fixed, not electricity-based)
  rewardTokensPerKm: 1.5,       // distanceKm * 15 * 10^dec / 10, paid per km TRAVELLED by EV
  iceGramsPerKm: { PETROL_REGULAR: 196, DIESEL_SUV: 224 },
  scoreStart: 500,
  scoreDeltaEv: +8,
  scoreDeltaIce: -5,
  // Penalties: recordICEJourney does NOT burn, deduct or transfer tokens. It only lowers the
  // stored score by 5, resets the streak and adds to totalEmittedGrams.
  // Rewards: recordEVJourney transfers tokens from the contract's own balance only if that
  // balance covers the reward. The contract never mints. If it is unfunded, the journey is
  // recorded but no tokens move.
  selfReported: true            // distance is supplied by the caller; the oracle role is unused
};

window.PORTAL_V3_CONFIG = PORTAL_V3_CONFIG;
window.EV_MOBILITY_REWARDS_ABI = EV_MOBILITY_REWARDS_ABI;
window.PORTAL_TOKEN_ABI = PORTAL_TOKEN_ABI;
window.VEHICLE_TYPE = VEHICLE_TYPE;
window.ONCHAIN_SUPPORTED_MODES = ONCHAIN_SUPPORTED_MODES;
window.ONCHAIN_RULES = ONCHAIN_RULES;
