// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPortalToken
 * @notice Standard ERC-20 interface for the Portal token used in MissionEV rewards.
 */
interface IPortalToken {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function name() external view returns (string memory);
}

/**
 * @title EVMobilityRewards
 * @notice MissionEV Smart Contract for Portal V3 EVM Testnet (Chain ID 420420777).
 * Implements EV clean-mobility rewards, fuel-type emission tiers, mileage overrides,
 * duplicate journey protection, and commuter on-chain score accounting.
 */
contract EVMobilityRewards {
    // --- Roles ---
    address public owner;
    address public oracle;
    IPortalToken public portalToken;

    // --- Enums & Types ---
    enum VehicleType {
        EV,              // Tier 1: Zero tailpipe (+ Reward)
        E20_ETHANOL,     // Tier 2: Ethanol blend (Lower emissions)
        PETROL_REGULAR,  // Tier 3: Standard passenger car
        PETROL_SPORTS,   // Tier 4: High consumption
        DIESEL_SUV       // Tier 5: Max emissions & PM2.5
    }

    struct CommuterStats {
        uint256 score;             // 0-1000 Carbon Score
        uint256 streakDays;        // Clean commute streak
        uint256 lastTripTimestamp; // Unix timestamp of last logged trip
        uint256 totalAvoidedGrams; // Cumulative avoided CO2 in grams
        uint256 totalEmittedGrams; // Cumulative emitted CO2 in grams
        uint256 totalTrips;        // Total logged commutes
        uint256 rewardsClaimed;    // Cumulative Portal tokens earned
    }

    struct JourneyRecord {
        bytes32 journeyId;
        address commuter;
        VehicleType vehicleType;
        uint32 distanceKm;
        uint32 customMileageKmPerLitre; // 0 for EV or when using default baseline
        uint32 co2Grams;
        bool isReward;                  // true = EV avoided carbon reward
        uint256 tokenAmount;            // Reward tokens credited
        uint256 timestamp;
    }

    // --- State Storage ---
    mapping(address => CommuterStats) public commuterStats;
    mapping(bytes32 => bool) public processedJourneys;
    mapping(bytes32 => JourneyRecord) public journeys;
    mapping(address => bytes32[]) public userJourneyIds;

    // Baseline emission factors (grams CO2 per km)
    uint32 public constant BASELINE_ICE_GRAMS_KM = 196; // Standard Petrol Sedan
    uint32 public constant EV_GRID_GRAMS_KM = 68;       // Indian national grid average
    uint32 public constant EV_REWARD_RATE_PER_KM = 15;  // 1.5 PORTAL (scaled * 10) per km avoided

    // --- Events ---
    event JourneyLogged(
        bytes32 indexed journeyId,
        address indexed commuter,
        VehicleType vehicleType,
        uint32 distanceKm,
        uint32 customMileage,
        uint32 co2Grams,
        bool isReward,
        uint256 tokenReward
    );
    event RewardClaimed(address indexed commuter, uint256 amount);
    event ScoreAdjusted(address indexed commuter, uint256 oldScore, uint256 newScore);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TokenContractUpdated(address indexed oldToken, address indexed newToken);

    // --- Modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "EVMobilityRewards: Caller is not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner, "EVMobilityRewards: Caller is not oracle");
        _;
    }

    constructor(address _portalToken, address _oracle) {
        owner = msg.sender;
        oracle = _oracle;
        if (_portalToken != address(0)) {
            portalToken = IPortalToken(_portalToken);
        }
    }

    // --- Admin Configuration ---
    function setPortalToken(address _newToken) external onlyOwner {
        require(_newToken != address(0), "EVMobilityRewards: Invalid token address");
        emit TokenContractUpdated(address(portalToken), _newToken);
        portalToken = IPortalToken(_newToken);
    }

    function setOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "EVMobilityRewards: Invalid oracle address");
        emit OracleUpdated(oracle, _newOracle);
        oracle = _newOracle;
    }

    /**
     * @notice Records an Electric Vehicle commute and transfers/credits rewards.
     * @param journeyId Unique cryptographic trip ID (UUID hash)
     * @param distanceKm Distance travelled in kilometers
     */
    function recordEVJourney(bytes32 journeyId, uint32 distanceKm) external {
        require(distanceKm > 0 && distanceKm <= 500, "EVMobilityRewards: Invalid distance");
        require(!processedJourneys[journeyId], "EVMobilityRewards: Journey already processed");

        address commuter = msg.sender;
        processedJourneys[journeyId] = true;

        // Calculate avoided CO2 vs baseline: (196 - 68) * distanceKm
        uint32 avoidedGrams = (BASELINE_ICE_GRAMS_KM - EV_GRID_GRAMS_KM) * distanceKm;
        
        // Calculate reward: 1.5 PORTAL tokens per km (in 18-decimal token units)
        uint256 rewardTokens = 0;
        if (address(portalToken) != address(0)) {
            uint8 dec = portalToken.decimals();
            rewardTokens = (uint256(distanceKm) * 15 * (10 ** dec)) / 10;
        }

        CommuterStats storage stats = commuterStats[commuter];
        uint256 oldScore = stats.score == 0 ? 500 : stats.score;

        // Update clean streak
        if (stats.lastTripTimestamp > 0 && block.timestamp - stats.lastTripTimestamp <= 1.5 days) {
            stats.streakDays += 1;
        } else {
            stats.streakDays = 1;
        }
        stats.lastTripTimestamp = block.timestamp;
        stats.totalAvoidedGrams += avoidedGrams;
        stats.totalTrips += 1;
        stats.score = min(1000, oldScore + 8);

        // Store Journey
        journeys[journeyId] = JourneyRecord({
            journeyId: journeyId,
            commuter: commuter,
            vehicleType: VehicleType.EV,
            distanceKm: distanceKm,
            customMileageKmPerLitre: 0,
            co2Grams: avoidedGrams,
            isReward: true,
            tokenAmount: rewardTokens,
            timestamp: block.timestamp
        });
        userJourneyIds[commuter].push(journeyId);

        // If reward token contract is configured and contract has balance, transfer tokens to commuter
        if (rewardTokens > 0 && address(portalToken) != address(0)) {
            if (portalToken.balanceOf(address(this)) >= rewardTokens) {
                portalToken.transfer(commuter, rewardTokens);
                stats.rewardsClaimed += rewardTokens;
                emit RewardClaimed(commuter, rewardTokens);
            }
        }

        emit JourneyLogged(journeyId, commuter, VehicleType.EV, distanceKm, 0, avoidedGrams, true, rewardTokens);
        emit ScoreAdjusted(commuter, oldScore, stats.score);
    }

    /**
     * @notice Records an Internal Combustion Engine (ICE) journey with optional custom mileage override.
     * @param journeyId Unique cryptographic trip ID
     * @param vehicleType Fuel type tier (E20_ETHANOL, PETROL_REGULAR, PETROL_SPORTS, DIESEL_SUV)
     * @param distanceKm Distance travelled in kilometers
     * @param customMileageKmPerLitre Optional mileage override (e.g., 14 for 14 km/L, 0 for default)
     */
    function recordICEJourney(
        bytes32 journeyId,
        VehicleType vehicleType,
        uint32 distanceKm,
        uint32 customMileageKmPerLitre
    ) external {
        require(vehicleType != VehicleType.EV, "EVMobilityRewards: Use recordEVJourney for EV");
        require(distanceKm > 0 && distanceKm <= 500, "EVMobilityRewards: Invalid distance");
        require(!processedJourneys[journeyId], "EVMobilityRewards: Journey already processed");

        address commuter = msg.sender;
        processedJourneys[journeyId] = true;

        // Determine emission factor based on vehicle tier & optional mileage override
        uint32 factorGramsPerKm = 196;
        if (vehicleType == VehicleType.E20_ETHANOL) {
            factorGramsPerKm = 165;
        } else if (vehicleType == VehicleType.PETROL_REGULAR) {
            factorGramsPerKm = 196;
        } else if (vehicleType == VehicleType.PETROL_SPORTS) {
            factorGramsPerKm = 240;
        } else if (vehicleType == VehicleType.DIESEL_SUV) {
            factorGramsPerKm = 224;
        }

        // Apply custom mileage override if supplied (>0)
        // Petrol standard: 14.5 km/L corresponds to ~196 g/km (2392g CO2 per litre petrol)
        if (customMileageKmPerLitre > 0 && customMileageKmPerLitre <= 50) {
            factorGramsPerKm = uint32(2392 / customMileageKmPerLitre);
        }

        uint32 totalCo2Grams = factorGramsPerKm * distanceKm;

        CommuterStats storage stats = commuterStats[commuter];
        uint256 oldScore = stats.score == 0 ? 500 : stats.score;

        stats.lastTripTimestamp = block.timestamp;
        stats.totalEmittedGrams += totalCo2Grams;
        stats.totalTrips += 1;
        
        // Reset streak on high fossil commute and adjust score
        if (stats.streakDays > 0) {
            stats.streakDays = 0;
        }
        stats.score = oldScore > 5 ? oldScore - 5 : 0;

        journeys[journeyId] = JourneyRecord({
            journeyId: journeyId,
            commuter: commuter,
            vehicleType: vehicleType,
            distanceKm: distanceKm,
            customMileageKmPerLitre: customMileageKmPerLitre,
            co2Grams: totalCo2Grams,
            isReward: false,
            tokenAmount: 0,
            timestamp: block.timestamp
        });
        userJourneyIds[commuter].push(journeyId);

        emit JourneyLogged(journeyId, commuter, vehicleType, distanceKm, customMileageKmPerLitre, totalCo2Grams, false, 0);
        emit ScoreAdjusted(commuter, oldScore, stats.score);
    }

    // --- View Functions ---
    function getCommuter(address commuter) external view returns (
        uint256 score,
        uint256 streakDays,
        uint256 lastTripTimestamp,
        uint256 totalAvoidedGrams,
        uint256 totalEmittedGrams,
        uint256 totalTrips,
        uint256 rewardsClaimed,
        uint256 tokenBalance
    ) {
        CommuterStats memory s = commuterStats[commuter];
        uint256 balance = 0;
        if (address(portalToken) != address(0)) {
            balance = portalToken.balanceOf(commuter);
        }
        return (
            s.score == 0 ? 500 : s.score,
            s.streakDays,
            s.lastTripTimestamp,
            s.totalAvoidedGrams,
            s.totalEmittedGrams,
            s.totalTrips,
            s.rewardsClaimed,
            balance
        );
    }

    function getUserJourneyCount(address commuter) external view returns (uint256) {
        return userJourneyIds[commuter].length;
    }

    function getUserJourneyAt(address commuter, uint256 index) external view returns (JourneyRecord memory) {
        bytes32 jId = userJourneyIds[commuter][index];
        return journeys[jId];
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
