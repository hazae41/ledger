# Ledger

Private and supply-chain hardened Ledger controller for TypeScript

```bash
npm i @hazae41/ledger
```

[**Node Package 📦**](https://www.npmjs.com/package/@hazae41/ledger)

## Features

### Current features
- 100% TypeScript and ESM
- No external dependencies
- Rust-like patterns
- No network code
- No tracking

## Usage

### Get USB connector

```tsx
/** Will open a popup using navigator.usb */
const device = Ledger.USB.getOrRequestDeviceOrThrow()
const connector = Ledger.USB.connectOrThrow(device)
```

### Get address and/or uncompressed public key at path

```tsx
const { address, uncompressedPublicKey } = await Ledger.Ethereum.getAddressOrThrow(connector, "44'/60'/0'/0/0")
```

### Sign a personal message at path

```tsx
const message = new TextEncoder().encode("Hello World")

const { r, s, v } = await Ledger.Ethereum.signPersonalMessageOrThrow(connector, "44'/60'/0'/0/0", message)
```

### Sign a transaction at path

```tsx
const transaction = ethers.utils.arrayify(ethers.Transaction.from({
  chainId,
  nonce,
  to,
  value,
  data
  gasLimit,
  gasPrice,
}).unsignedSerialized)

const { r, s, v } = await Ledger.Ethereum.signTransactionOrThrow(connector, "44'/60'/0'/0/0", transaction)
```