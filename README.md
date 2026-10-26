# MissionEV: Living Climate Intelligence

A static web prototype for the **Build with Bharat 5.0 (Microsoft Azure)** and **Portaldot Hacker House 2026 (Portal EVM)** hackathons. It compares the CO2e of commuting options, shows a sample dashboard, and can optionally record a journey on a Portal V3 testnet contract.

> **Prototype status.** Emissions figures are modelled estimates, several with illustrative or unverified inputs. They are **not certified carbon credits**. Profiles, trips, leaderboards and histories are fictional demo data. See [AUDIT.md](AUDIT.md) for what is real, simulated, or planned.

## Two explicit modes

| | Demo mode (default) | Portal V3 testnet mode |
| --- | --- | --- |
| Needs wallet, gas, contract | No | Yes |
| Emissions | Local model (`js/data.js`) | Same lab model, plus a preview of what the contract records |
| Transactions | Animated walkthrough labelled "NOT SUBMITTED TO BLOCKCHAIN". No hash, block or receipt is ever shown | Real `recordEVJourney` / `recordICEJourney` call; hash and receipt come from the chain |
| Journey types | All 7 | Electric Car, Petrol Car, Diesel SUV only (the contract has no other methods) |

On-chain submit stays disabled until a wallet is connected, its chain is `420420777`, a contract address is configured, and `eth_getCode` at that address returns bytecode.

## Deployment status

No EVMobilityRewards deployment is bundled. The addresses that used to be in this README had **no bytecode** on the testnet (checked 2026-10-26). To enable testnet mode:

1. Deploy `contract/EVMobilityRewards.sol` (constructor: reward token address, oracle address) on Portal V3.
2. Transfer reward tokens to the contract (it pays from its own balance and never mints).
3. Paste the contract address into the "Deployment checks" panel on the page, or set `contractAddress` in `js/contract-abi.js`.

## Network

| Parameter | Value (verified against the RPC) |
| --- | --- |
| Chain ID | `420420777` (`0x190f1ca9`) |
| RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| Gas token | `PORTAL` (18 decimals) |

## Layout

```
index.html
css/styles.css        styles (moved from root style.css; index.html loads this path)
js/contract-abi.js    the ONE config module: chain, address, ABI, supported journey types, contract constants
js/data.js            the ONE emissions model + fictional sample data
js/simulator.js       Mobility Lab
js/dashboard.js       sample dashboard
js/web3-portal.js     wallet + real transactions + live deployment checks
js/web3-azure.js      pipeline explainer, simulated walkthrough, architecture status
js/city-simulator.js  route comparison, city scenario, methodology panel
contract/             Solidity sources (EVMobilityRewards.sol is the one the UI targets)
```

## Run locally

```bash
python -m http.server 3000
# or: npm start
```

Open http://localhost:3000. No build step. Deploy as static files from the repo root.
