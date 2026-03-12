import {
  CHAIN_REGISTRY,
  getChain,
  getChainOrThrow,
  getAllChainIds,
  getChainsByFamily,
  isSwapEnabled,
  type ChainConfig,
} from '../registry';

describe('Chain Registry', () => {
  describe('CHAIN_REGISTRY', () => {
    it('should contain expected chains', () => {
      expect(CHAIN_REGISTRY.solana).toBeDefined();
      expect(CHAIN_REGISTRY.ethereum).toBeDefined();
      expect(CHAIN_REGISTRY.polygon).toBeDefined();
      expect(CHAIN_REGISTRY.arbitrum).toBeDefined();
      expect(CHAIN_REGISTRY.optimism).toBeDefined();
      expect(CHAIN_REGISTRY.base).toBeDefined();

      expect(CHAIN_REGISTRY.bnb).toBeDefined();
      expect(CHAIN_REGISTRY.bitcoin).toBeDefined();
      expect(CHAIN_REGISTRY.bitcoincash).toBeDefined();
      expect(CHAIN_REGISTRY.litecoin).toBeDefined();
      expect(CHAIN_REGISTRY.zcash).toBeDefined();
      expect(CHAIN_REGISTRY.tron).toBeDefined();
      expect(CHAIN_REGISTRY.monero).toBeDefined();
    });

    it('should have valid configuration for each chain', () => {
      for (const [id, chain] of Object.entries(CHAIN_REGISTRY)) {
        expect(chain.id).toBe(id);
        expect(chain.name).toBeTruthy();
        expect(chain.symbol).toBeTruthy();
        expect(chain.decimals).toBeGreaterThanOrEqual(0);
        expect(chain.family).toBeTruthy();
        expect(chain.rpcUrls.length).toBeGreaterThan(0);
        expect(chain.explorerUrl).toBeTruthy();
        expect(chain.iconId).toBeTruthy();
        expect(chain.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('getChain', () => {
    it('should return chain config for valid IDs', () => {
      const solana = getChain('solana');
      expect(solana).toBeDefined();
      expect(solana?.name).toBe('Solana');

      const btc = getChain('bitcoin');
      expect(btc).toBeDefined();
      expect(btc?.symbol).toBe('BTC');
    });

    it('should return undefined for invalid IDs', () => {
      expect(getChain('nonexistent')).toBeUndefined();
      expect(getChain('')).toBeUndefined();
    });
  });

  describe('getChainOrThrow', () => {
    it('should return chain config for valid IDs', () => {
      const chain = getChainOrThrow('ethereum');
      expect(chain.name).toBe('Ethereum');
    });

    it('should throw for invalid IDs', () => {
      expect(() => getChainOrThrow('nonexistent')).toThrow();
    });
  });

  describe('getAllChainIds', () => {
    it('should return all chain IDs', () => {
      const chainIds = getAllChainIds();
      expect(chainIds.length).toBeGreaterThanOrEqual(13);
    });
  });

  describe('getChainsByFamily', () => {
    it('should filter by EVM family', () => {
      const evmChains = getChainsByFamily('evm');
      expect(evmChains.length).toBeGreaterThanOrEqual(6); // eth, polygon, arb, opt, base, bnb
      expect(evmChains.every((c: ChainConfig) => c.family === 'evm')).toBe(true);
    });

    it('should filter by Bitcoin family', () => {
      const btcChains = getChainsByFamily('bitcoin');
      expect(btcChains.length).toBe(4);
      expect(btcChains.every((c: ChainConfig) => c.family === 'bitcoin')).toBe(true);
    });

    it('should filter by TRON family', () => {
      const tronChains = getChainsByFamily('tron');
      expect(tronChains.length).toBe(1);
      expect(tronChains[0].id).toBe('tron');
    });

    it('should filter by Monero family', () => {
      const moneroChains = getChainsByFamily('monero');
      expect(moneroChains.length).toBe(1);
      expect(moneroChains[0].id).toBe('monero');
    });
  });

  describe('isSwapEnabled', () => {
    it('should return true for swap-enabled chains', () => {
      expect(isSwapEnabled('ethereum')).toBe(true);
      expect(isSwapEnabled('bnb')).toBe(true);
      // TRON swap is disabled until SunSwap integration is complete
    });

    it('should return false for Bitcoin-family chains', () => {
      expect(isSwapEnabled('bitcoin')).toBe(false);
      expect(isSwapEnabled('bitcoincash')).toBe(false);
      expect(isSwapEnabled('litecoin')).toBe(false);
      expect(isSwapEnabled('zcash')).toBe(false);
    });

    it('should return false for Monero', () => {
      expect(isSwapEnabled('monero')).toBe(false);
    });

    it('should return false for TRON (SunSwap not yet implemented)', () => {
      expect(isSwapEnabled('tron')).toBe(false);
    });
  });

  describe('Chain Configurations', () => {
    describe('BNB Smart Chain', () => {
      const bnb = CHAIN_REGISTRY.bnb;

      it('should have correct configuration', () => {
        expect(bnb.family).toBe('evm');
        expect(bnb.symbol).toBe('BNB');
        expect(bnb.chainId).toBe(56);
        expect(bnb.swapEnabled).toBe(true);
        expect(bnb.swapProvider).toBe('paraswap');
      });

      it('should have testnet configuration', () => {
        expect(bnb.testnet).toBeDefined();
        expect(bnb.testnet?.chainId).toBe(97);
      });
    });

    describe('Bitcoin', () => {
      const btc = CHAIN_REGISTRY.bitcoin;

      it('should have correct configuration', () => {
        expect(btc.family).toBe('bitcoin');
        expect(btc.symbol).toBe('BTC');
        expect(btc.decimals).toBe(8);
        expect(btc.coinType).toBe(0);
        expect(btc.swapEnabled).toBe(false);
      });

      it('should have alternative derivation paths', () => {
        expect(btc.alternativeDerivationPaths).toBeDefined();
        expect(btc.alternativeDerivationPaths?.legacy).toBeDefined();
      });
    });

    describe('TRON', () => {
      const tron = CHAIN_REGISTRY.tron;

      it('should have correct configuration', () => {
        expect(tron.family).toBe('tron');
        expect(tron.symbol).toBe('TRX');
        expect(tron.decimals).toBe(6);
        expect(tron.coinType).toBe(195);
        expect(tron.swapEnabled).toBe(false);
      });

      it('should have popular tokens', () => {
        expect(tron.popularTokens).toBeDefined();
        expect(tron.popularTokens!.length).toBeGreaterThan(0);

        const usdt = tron.popularTokens!.find((t) => t.symbol === 'USDT');
        expect(usdt).toBeDefined();
      });
    });

    describe('Monero', () => {
      const xmr = CHAIN_REGISTRY.monero;

      it('should have correct configuration', () => {
        expect(xmr.family).toBe('monero');
        expect(xmr.symbol).toBe('XMR');
        expect(xmr.decimals).toBe(12);
        expect(xmr.swapEnabled).toBe(false);
      });

      it('should not have derivation path (watch-only)', () => {
        expect(xmr.derivationPath).toBe('');
      });
    });
  });
});
