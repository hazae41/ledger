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
import { Ledger } from "@hazae41/ledger"

const { address, uncompressedPublicKey } = await Ledger.Ethereum.getAddressOrThrow(connector, "44'/60'/0'/0/0")
```

### Sign a personal message at path

```tsx
import { Ledger } from "@hazae41/ledger"
import { ZeroHexSignature } from "@hazae41/cubane"

const message = new TextEncoder().encode("Hello World")

const rsvSignature = await Ledger.Ethereum.signPersonalMessageOrThrow(connector, "44'/60'/0'/0/0", message)
const zeroHexSignature = ZeroHexSignature.from(rsvSignature)
```

### Sign a transaction at path

```tsx
import { Ledger } from "@hazae41/ledger"
import { ZeroHexSignature } from "@hazae41/cubane"

const transaction = ethers.utils.arrayify(ethers.Transaction.from({
  chainId,
  nonce,
  to,
  value,
  data
  gasLimit,
  gasPrice,
}).unsignedSerialized)

const rsvSignature = await Ledger.Ethereum.signTransactionOrThrow(connector, "44'/60'/0'/0/0", transaction)
const zeroHexSignature = ZeroHexSignature.from(rsvSignature)
```

### Sign EIP712 typed message at path

```tsx
import { Ledger } from "@hazae41/ledger"
import { ZeroHexSignature } from "@hazae41/cubane"

const rsvSignature = await Ledger.Ethereum.signEIP712HashedMessageOrThrow(connector, "44'/60'/0'/0/0", domain, message)
const zeroHexSignature = ZeroHexSignature.from(rsvSignature)
```