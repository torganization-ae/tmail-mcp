declare module 'tweetnacl' {
  export interface BoxKeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }

  export const box: {
    before(publicKey: Uint8Array, secretKey: Uint8Array): Uint8Array;
  };

  export const secretbox: {
    open(box: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null;
  };
}
