# Offline IEEE MA-L registry

`ieee-ma-l.json` is generated from the IEEE Registration Authority's official
MA-L public listing:

https://standards-oui.ieee.org/oui/oui.csv

Bundled snapshot: 2026-07-26, 39,809 usable assignments. The source CSV
SHA-256 was
`b02c2fc19978a951ef487c8d2ef4d63515d5be2960f18068f3ccd29f6d8e7aa9`.

The server reads this bundled file locally. Device discovery never calls an
external vendor-lookup API.

Update it with:

```sh
npm run network:vendors:update
```

For a reproducible build from an already-downloaded source file:

```sh
node scripts/update-ieee-oui-registry.mjs /path/to/oui.csv
```

## Offline Bluetooth Assigned Numbers

`bluetooth-assigned-numbers.json` is generated from the Bluetooth SIG public
Assigned Numbers repository. It bundles company identifiers, standard GATT
service UUIDs, and member-assigned UUID ownership so BLE identification works
without a runtime network lookup:

https://bitbucket.org/bluetooth-SIG/public/src/main/assigned_numbers/

Update it with:

```sh
npm run bluetooth:registry:update
```

Aria treats these assignments as evidence of the advertiser or service owner,
not proof of a specific product model.
